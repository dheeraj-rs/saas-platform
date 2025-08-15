import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantDatabase } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || 'demo';
    const db = await getTenantDatabase(tenantId);

    const body = await req.json().catch(() => ({}));
    const { coords, city, country, offline, ip: clientIp } = body || {};

    // Extract client IP (best-effort)
    const ip =
      clientIp ||
      req.headers.get('x-forwarded-for')?.split(',')[0] ||
      req.headers.get('x-real-ip') ||
      undefined;

    const now = new Date();
    let location = coords
      ? { lat: coords.lat, lng: coords.lng, city, country }
      : undefined;

    // If no coordinates but IP is known, enrich from IP geolocation (best-effort)
    if (!location && ip) {
      try {
        const resp = await fetch(`https://ipapi.co/${ip}/json/`, {
          cache: 'no-store',
        });
        if (resp.ok) {
          const j = await resp.json();
          const lat = parseFloat(j.latitude);
          const lng = parseFloat(j.longitude);
          location = {
            lat: isNaN(lat) ? undefined : lat,
            lng: isNaN(lng) ? undefined : lng,
            city: j.city,
            country: j.country_name || j.country,
          } as any;
        }
      } catch {}
    }

    // Update user presence
    await db.collection('users').updateOne(
      { email: session.user.email },
      {
        $set: {
          lastSeen: now,
          isActive: offline ? false : true,
          ...(location ? { lastLocation: location } : {}),
          ...(ip ? { ip } : {}),
        },
      },
      { upsert: true }
    );

    // Log presence activity: treat offline as an explicit logout to reflect in dashboards
    await db.collection('userActivities').insertOne({
      type: offline ? 'logout' : 'heartbeat',
      userEmail: session.user.email,
      userId: (session.user as any).id,
      tenantId,
      timestamp: now,
      ...(location ? { location } : {}),
      ...(ip ? { ip } : {}),
    });

    return NextResponse.json({ ok: true, at: now.toISOString() });
  } catch (e) {
    console.error('presence POST error:', e);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// For demo: list live users seen in last 15 minutes
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const role = (session.user as any).role as string | undefined;
    if (role !== 'admin' && role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const tenantId = (session.user as any).tenantId || 'demo';
    const db = await getTenantDatabase(tenantId);
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const now = Date.now();
    const raw = await db
      .collection('users')
      .find({ lastSeen: { $gte: since } })
      .project({
        email: 1,
        name: 1,
        tenantId: 1,
        lastLogin: 1,
        lastSeen: 1,
        isActive: 1,
        lastLocation: 1,
        ip: 1,
        _id: 0,
      })
      .toArray();
    const users = raw.map((u: any) => {
      const seen = u.lastSeen ? new Date(u.lastSeen).getTime() : 0;
      const recent = seen > 0 && now - seen <= 20 * 1000;
      const active = u.isActive === true && recent; // must be explicitly active AND recent
      return { ...u, isActive: active };
    });
    return NextResponse.json({ users, since: since.toISOString() });
  } catch (e) {
    console.error('presence GET error:', e);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
