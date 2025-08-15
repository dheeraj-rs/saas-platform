import { NextRequest, NextResponse } from 'next/server';
import { getTenantDatabase, getSharedDatabase } from '@/lib/db';
import { withRateLimit, adminRateLimit } from '@/lib/rateLimiter';
import { verifyToken } from '@/lib/auth';
import { User, AuditLog, SecurityAlert } from '@/lib/models/user';

// Get dashboard metrics
export async function GET(request: NextRequest) {
  return withRateLimit(adminRateLimit, request, async () => {
    try {
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return NextResponse.json(
          { error: 'Authorization token required' },
          { status: 401 }
        );
      }

      const payload = verifyToken(token);
      if (!payload || (payload.role !== 'admin' && payload.role !== 'super_admin')) {
        return NextResponse.json(
          { error: 'Insufficient privileges' },
          { status: 403 }
        );
      }

      const { searchParams } = new URL(request.url);
      const tenantId = searchParams.get('tenantId') || payload.tenantId;

      if (payload.role === 'admin' && payload.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'Access denied to this tenant' },
          { status: 403 }
        );
      }

      const tenantDb = await getTenantDatabase(tenantId);
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get user metrics
      const totalUsers = await tenantDb.collection('users').countDocuments();
      const activeUsers = await tenantDb.collection('users').countDocuments({ isActive: true });
      const newUsers = await tenantDb.collection('users').countDocuments({
        createdAt: { $gte: last7d }
      });

      // Get security metrics
      const securityAlerts = await tenantDb.collection('securityAlerts').countDocuments({
        detectedAt: { $gte: last24h },
        status: 'open'
      });

      const failedLogins = await tenantDb.collection('auditLogs').countDocuments({
        action: 'auth_failed',
        timestamp: { $gte: last24h }
      });

      const successfulLogins = await tenantDb.collection('auditLogs').countDocuments({
        action: 'auth_success',
        timestamp: { $gte: last24h }
      });

      // Get system metrics
      const apiRequests = await tenantDb.collection('auditLogs').countDocuments({
        timestamp: { $gte: last24h },
        category: { $ne: 'auth' }
      });

      // Get recent security alerts
      const recentAlerts = await tenantDb.collection<SecurityAlert>('securityAlerts')
        .find({
          detectedAt: { $gte: last7d }
        })
        .sort({ detectedAt: -1 })
        .limit(10)
        .toArray();

      // Get top countries by login attempts
      const loginsByCountry = await tenantDb.collection('auditLogs').aggregate([
        {
          $match: {
            action: { $in: ['auth_success', 'auth_failed'] },
            timestamp: { $gte: last7d }
          }
        },
        {
          $group: {
            _id: '$details.geolocation.country',
            count: { $sum: 1 },
            successful: {
              $sum: { $cond: [{ $eq: ['$action', 'auth_success'] }, 1, 0] }
            },
            failed: {
              $sum: { $cond: [{ $eq: ['$action', 'auth_failed'] }, 1, 0] }
            }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).toArray();

      // Get hourly activity for the last 24 hours
      const hourlyActivity = await tenantDb.collection('auditLogs').aggregate([
        {
          $match: {
            timestamp: { $gte: last24h }
          }
        },
        {
          $group: {
            _id: {
              hour: { $hour: '$timestamp' },
              date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.date': 1, '_id.hour': 1 } }
      ]).toArray();

      return NextResponse.json({
        success: true,
        metrics: {
          users: {
            total: totalUsers,
            active: activeUsers,
            new: newUsers,
          },
          security: {
            alerts: securityAlerts,
            failedLogins,
            successfulLogins,
            loginSuccessRate: successfulLogins / Math.max(successfulLogins + failedLogins, 1),
          },
          system: {
            apiRequests,
            uptime: '99.9%', // Would be calculated from actual monitoring
            responseTime: '120ms', // Would come from monitoring system
          },
        },
        charts: {
          loginsByCountry,
          hourlyActivity,
        },
        recentAlerts: recentAlerts.map(alert => ({
          id: alert._id,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          detectedAt: alert.detectedAt,
          status: alert.status,
        })),
      });

    } catch (error) {
      console.error('Admin dashboard error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

// Create security alert
export async function POST(request: NextRequest) {
  return withRateLimit(adminRateLimit, request, async () => {
    try {
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return NextResponse.json(
          { error: 'Authorization token required' },
          { status: 401 }
        );
      }

      const payload = verifyToken(token);
      if (!payload || (payload.role !== 'admin' && payload.role !== 'super_admin')) {
        return NextResponse.json(
          { error: 'Insufficient privileges' },
          { status: 403 }
        );
      }

      const {
        tenantId = payload.tenantId,
        type,
        severity,
        title,
        description,
        userId,
        ipAddress,
        userAgent,
        relatedEvents = [],
        autoResponse
      } = await request.json();

      if (!type || !severity || !title || !description) {
        return NextResponse.json(
          { error: 'Missing required fields' },
          { status: 400 }
        );
      }

      if (payload.role === 'admin' && payload.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'Access denied to this tenant' },
          { status: 403 }
        );
      }

      const tenantDb = await getTenantDatabase(tenantId);

      const securityAlert: Omit<SecurityAlert, '_id'> = {
        tenantId,
        type,
        severity,
        title,
        description,
        userId,
        ipAddress,
        userAgent,
        relatedEvents,
        status: 'open',
        detectedAt: new Date(),
        autoResponse,
      };

      const result = await tenantDb.collection('securityAlerts').insertOne(securityAlert);

      // Log the alert creation
      await tenantDb.collection('auditLogs').insertOne({
        tenantId,
        userId: payload.userId,
        action: 'security_alert_created',
        resource: 'security_alert',
        resourceId: result.insertedId.toString(),
        details: {
          type,
          severity,
          title,
        },
        ipAddress: request.ip || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        requestId: crypto.randomUUID(),
        success: true,
        severity: 'medium',
        category: 'security',
        timestamp: new Date(),
        retainUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      return NextResponse.json({
        success: true,
        alertId: result.insertedId.toString(),
        message: 'Security alert created successfully',
      });

    } catch (error) {
      console.error('Create security alert error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

// Update security alert status
export async function PATCH(request: NextRequest) {
  return withRateLimit(adminRateLimit, request, async () => {
    try {
      const token = request.headers.get('authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return NextResponse.json(
          { error: 'Authorization token required' },
          { status: 401 }
        );
      }

      const payload = verifyToken(token);
      if (!payload || (payload.role !== 'admin' && payload.role !== 'super_admin')) {
        return NextResponse.json(
          { error: 'Insufficient privileges' },
          { status: 403 }
        );
      }

      const {
        tenantId = payload.tenantId,
        alertId,
        status,
        assignedTo,
        notes
      } = await request.json();

      if (!alertId || !status) {
        return NextResponse.json(
          { error: 'Alert ID and status required' },
          { status: 400 }
        );
      }

      if (payload.role === 'admin' && payload.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'Access denied to this tenant' },
          { status: 403 }
        );
      }

      const tenantDb = await getTenantDatabase(tenantId);

      const updateData: Partial<SecurityAlert> = {
        status,
        assignedTo,
      };

      if (status === 'resolved') {
        updateData.resolvedAt = new Date();
      }

      const result = await tenantDb.collection('securityAlerts').updateOne(
        { _id: alertId, tenantId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        return NextResponse.json(
          { error: 'Security alert not found' },
          { status: 404 }
        );
      }

      // Log the status change
      await tenantDb.collection('auditLogs').insertOne({
        tenantId,
        userId: payload.userId,
        action: 'security_alert_updated',
        resource: 'security_alert',
        resourceId: alertId,
        details: {
          status,
          assignedTo,
          notes,
        },
        ipAddress: request.ip || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        requestId: crypto.randomUUID(),
        success: true,
        severity: 'low',
        category: 'security',
        timestamp: new Date(),
        retainUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      return NextResponse.json({
        success: true,
        message: 'Security alert updated successfully',
      });

    } catch (error) {
      console.error('Update security alert error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}