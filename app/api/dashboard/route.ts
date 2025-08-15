import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantDatabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    if (!process.env.MONGODB_URI) {
      return NextResponse.json(
        { error: 'Database not configured. Set MONGODB_URI to enable real data.' },
        { status: 503 }
      );
    }
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || 'demo';
    const db = await getTenantDatabase(tenantId);

    // Metrics
    const usersCol = db.collection('users');
    const alertsCol = db.collection('securityAlerts');
    const requestsCol = db.collection('requests'); // optional analytics collection
    const systemCol = db.collection('system'); // optional system metrics

    // Active users should match presence logic: isActive === true AND lastSeen within 20s
    const presenceWindowMs = 20 * 1000;
    const presenceSince = new Date(Date.now() - presenceWindowMs);
    const fifteenMinSince = new Date(Date.now() - 15 * 60 * 1000);
    // Superadmin filtering
    const superadminEmails = (process.env.SUPERADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const notSuperadminRole = { role: { $ne: 'superadmin' } };
    const notSuperadminEmail = superadminEmails.length
      ? { email: { $nin: superadminEmails } }
      : {};

    const activeFilter: any = {
      isActive: true,
      lastSeen: { $gte: presenceSince },
      ...notSuperadminRole,
      ...notSuperadminEmail,
    };

    const visitorsFilter: any = {
      ip: { $exists: true },
      lastSeen: { $gte: fifteenMinSince },
      ...notSuperadminRole,
      ...notSuperadminEmail,
    };

    const [totalUsers, activeUsers, alertsCount, latestSystem, recentIps] = await Promise.all([
      usersCol.countDocuments({}),
      usersCol.countDocuments(activeFilter),
      alertsCol.countDocuments({}),
      systemCol.find({}).sort({ updatedAt: -1 }).limit(1).toArray().catch(() => []),
      usersCol.distinct('ip', visitorsFilter).catch(() => [] as string[]),
    ]);

    // Charts: user activity for last 24h grouped by hour
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activityAgg = await usersCol
      .aggregate([
        { $match: { lastLogin: { $gte: since } } },
        { $group: {
            _id: { $dateToString: { date: '$lastLogin', format: '%H:00' } },
            users: { $sum: 1 },
          } },
        { $project: { _id: 0, time: '$_id', users: 1 } },
        { $sort: { time: 1 } },
      ])
      .toArray()
      .catch(() => [] as Array<{ time: string; users: number }>);

    // API requests per hour (if collection exists)
    const requestsAgg = await requestsCol
      .aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: {
            _id: { $dateToString: { date: '$timestamp', format: '%H:00' } },
            requests: { $sum: 1 },
          } },
        { $project: { _id: 0, time: '$_id', requests: 1 } },
        { $sort: { time: 1 } },
      ])
      .toArray()
      .catch(() => [] as Array<{ time: string; requests: number }>);

    // Merge activity and requests by time
    const timeMap = new Map<string, { time: string; users: number; requests: number }>();
    for (const a of activityAgg) timeMap.set(a.time, { time: a.time, users: a.users, requests: 0 });
    for (const r of requestsAgg) {
      const cur = timeMap.get(r.time) || { time: r.time, users: 0, requests: 0 };
      cur.requests = r.requests;
      timeMap.set(r.time, cur);
    }
    const userActivity = Array.from(timeMap.values()).sort((x, y) => x.time.localeCompare(y.time));

    // Security events by date for last 7 days
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const securityEvents = await alertsCol
      .aggregate([
        { $match: { timestamp: { $gte: since7 } } },
        { $group: {
            _id: { $dateToString: { date: '$timestamp', format: '%Y-%m-%d' } },
            threats: { $sum: 1 },
            blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
          } },
        { $project: { _id: 0, date: '$_id', threats: 1, blocked: 1 } },
        { $sort: { date: 1 } },
      ])
      .toArray()
      .catch(() => [] as Array<{ date: string; threats: number; blocked: number }>);

    // Performance metrics (optional)
    const performanceMetrics = [
      {
        metric: 'Response Time',
        value: latestSystem?.[0]?.responseTimeMs ?? 0,
        change: 0,
      },
      {
        metric: 'Throughput',
        value: latestSystem?.[0]?.throughput ?? 0,
        change: 0,
      },
      {
        metric: 'Error Rate',
        value: latestSystem?.[0]?.errorRate ?? 0,
        change: 0,
      },
    ];

    // Recent activity (logins/signouts/heartbeats) from userActivities and auditLogs if present
    const [activities, auditLogs] = await Promise.all([
      db
        .collection('userActivities')
        .find(
          superadminEmails.length
            ? { userEmail: { $nin: superadminEmails } }
            : {}
        )
        .sort({ timestamp: -1 })
        .limit(10)
        .toArray()
        .catch(() => []),
      db
        .collection('auditLogs')
        .find({})
        .sort({ timestamp: -1 })
        .limit(10)
        .toArray()
        .catch(() => []),
    ]);

    const mapActivity = (a: any) => {
      const type = a.type || 'activity';
      const status: 'success' | 'warning' | 'error' =
        type === 'offline' ? 'warning' : 'success';
      return {
        id: String(a._id || `${type}-${a.timestamp || Date.now()}`),
        action: type,
        user: a.userEmail || a.user || 'system',
        timestamp: a.timestamp || new Date(),
        status,
      };
    };

    const recentActivity = [
      ...activities.map(mapActivity),
      ...auditLogs.map((l: any) => ({
        id: String(l._id),
        action: l.action ?? 'activity',
        user: l.user ?? 'system',
        timestamp: l.timestamp ?? new Date(),
        status: (l.status as 'success' | 'warning' | 'error') ?? 'success',
      })),
    ]
      .sort((a, b) => new Date(b.timestamp as any).getTime() - new Date(a.timestamp as any).getTime())
      .slice(0, 10);

    // Security alerts list
    const alerts = await alertsCol
      .find({})
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray()
      .catch(() => []);

    const securityAlerts = alerts.map((a: any) => ({
      id: String(a._id),
      type: a.type ?? 'generic',
      severity: (a.severity as 'low' | 'medium' | 'high' | 'critical') ?? 'low',
      title: a.title ?? 'Security Alert',
      description: a.description ?? '',
      timestamp: a.timestamp ?? new Date(),
    }));

    return NextResponse.json({
      success: true,
      metrics: {
        totalUsers,
        activeUsers,
        securityAlerts: alertsCount,
        systemUptime: latestSystem?.[0]?.uptime ?? 'N/A',
        apiRequests: requestsAgg.reduce((s, r) => s + (r.requests || 0), 0),
        responseTime: latestSystem?.[0]?.responseTimeMs ? `${latestSystem[0].responseTimeMs}ms` : 'N/A',
        visitors: Array.isArray(recentIps) ? recentIps.length : 0,
      },
      charts: { userActivity, securityEvents, performanceMetrics },
      recentActivity,
      securityAlerts,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
