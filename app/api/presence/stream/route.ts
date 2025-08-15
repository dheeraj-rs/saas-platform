import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantDatabase } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response('Unauthorized', { status: 401 });
  }
  const role = (session.user as any).role as string | undefined;
  if (role !== 'admin' && role !== 'superadmin') {
    return new Response('Forbidden', { status: 403 });
  }

  const tenantId = (session.user as any).tenantId || 'demo';
  const db = await getTenantDatabase(tenantId);
  const usersCol = db.collection('users');
  const activitiesCol = db.collection('userActivities');

  const presenceWindowMs = 20 * 1000;
  const superadminEmails = (process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const encoder = new TextEncoder();

  async function snapshot() {
    const since = new Date(Date.now() - presenceWindowMs);
    const userFilter: any = {
      isActive: true,
      lastSeen: { $gte: since },
      role: { $ne: 'superadmin' },
      ...(superadminEmails.length ? { email: { $nin: superadminEmails } } : {}),
    };
    const activeUsers = await usersCol.countDocuments(userFilter);
    const actFilter: any = {
      type: { $in: ['login', 'offline'] },
      ...(superadminEmails.length ? { userEmail: { $nin: superadminEmails } } : {}),
    };
    const activities = await activitiesCol
      .find(actFilter)
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray()
      .catch(() => []);

    const recentActivity = activities.map((a: any) => ({
      id: String(a._id || `${a.type}-${a.timestamp || Date.now()}`),
      action: a.type || 'activity',
      user: a.userEmail || a.user || 'system',
      timestamp: a.timestamp || new Date(),
      status: (a.type === 'offline' ? 'warning' : 'success') as 'success' | 'warning' | 'error',
    }));

    return { activeUsers, recentActivity };
  }

  let closeRef: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      // Send initial snapshot
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // ignore enqueue after close
        }
      };

      let usersStream: any = null;
      let activitiesStream: any = null;
      let keepaliveId: any = null;
      let pollId: any = null;
      let lastSent: string | null = null;

      const writeEvent = async (kind: 'snapshot' | 'update' = 'update') => {
        try {
          const data = await snapshot();
          const payload = JSON.stringify(data);
          if (payload !== lastSent) {
            lastSent = payload;
            safeEnqueue(`event: ${kind}\n`);
            safeEnqueue(`data: ${payload}\n\n`);
          }
        } catch {
          // ignore
        }
      };

      try {
        await writeEvent('snapshot');
      } catch {}

      // Try MongoDB change streams; fallback to timer if not supported
      try {
        // @ts-ignore
        usersStream = usersCol.watch(
          [{ $match: { operationType: { $in: ['insert', 'update', 'replace'] } } }],
          { fullDocument: 'updateLookup' }
        );
        // @ts-ignore
        // Only react to login/offline inserts
        activitiesStream = activitiesCol.watch([
          {
            $match: {
              operationType: { $in: ['insert'] },
              'fullDocument.type': { $in: ['login', 'offline'] },
            },
          },
        ]);

        const onChange = async () => {
          await writeEvent('update');
        };
        usersStream.on('change', onChange);
        activitiesStream.on('change', onChange);

        keepaliveId = setInterval(() => {
          safeEnqueue(`event: ping\n`);
          safeEnqueue('data: {}\n\n');
        }, 15000);
      } catch (e) {
        // Fallback polling every 3s
        pollId = setInterval(() => {
          writeEvent('update');
        }, 3000);
      }

      const close = () => {
        if (closed) return;
        closed = true;
        try { usersStream && usersStream.close && usersStream.close(); } catch {}
        try { activitiesStream && activitiesStream.close && activitiesStream.close(); } catch {}
        try { keepaliveId && clearInterval(keepaliveId); } catch {}
        try { pollId && clearInterval(pollId); } catch {}
      };
      closeRef = close;

      // Attempt to close on GC/finalization
      // @ts-ignore
      controller.signal?.addEventListener?.('abort', close);
      // No signal? rely on cancel
      // fallthrough
    },
    cancel: () => {
      // ensure cleanup if consumer disconnects
      try { closeRef && closeRef(); } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
