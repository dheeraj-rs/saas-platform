import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantDatabase } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
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
    const raw = await db
      .collection('users')
      .find({})
      .project({
        _id: 0,
        email: 1,
        name: 1,
        tenantId: 1,
        role: 1,
        lastLogin: 1,
        lastSeen: 1,
        isActive: 1,
        ip: 1,
        lastLocation: 1,
      })
      .toArray();

    // Normalize isActive to be true only if explicitly active AND seen within last 20s
    const now = Date.now();
    const users = raw.map((u: any) => {
      const seen = u.lastSeen ? new Date(u.lastSeen).getTime() : 0;
      const recent = seen > 0 && now - seen <= 20 * 1000;
      const active = u.isActive === true && recent;
      return { ...u, isActive: active };
    });

    return NextResponse.json({ users });
  } catch (e) {
    console.error('users GET error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
