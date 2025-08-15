'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface UserRow {
  name?: string;
  email: string;
  tenantId?: string;
  role?: string;
  lastLogin?: string;
  lastSeen?: string;
  isActive?: boolean;
  ip?: string;
  lastLocation?: {
    lat?: number;
    lng?: number;
    city?: string;
    country?: string;
  };
}

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [liveUsers, setLiveUsers] = useState<UserRow[]>([]);
  const [tab, setTab] = useState<'live' | 'all'>('live');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [publicIp, setPublicIp] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/login');
  }, [status, router]);

  const load = useCallback(async () => {
    try {
      setUpdating(true);
      // live users (last 15m)
      const pres = await fetch('/api/presence');
      if (pres.ok) {
        const data = await pres.json();
        setLiveUsers((data.users || []).map((u: any) => normalizeUser(u)));
      }
      // all users
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setAllUsers((data.users || []).map((u: any) => normalizeUser(u)));
      }
    } catch (e) {
      // noop
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    load();
    const id = setInterval(load, 3000); // refresh every 3s for near real-time
    return () => clearInterval(id);
  }, [session?.user, load]);

  // Request geolocation (best-effort)
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGeo({ lat: latitude, lng: longitude });
      },
      () => { },
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }, []);

  // Send presence heartbeat so status/IP/location update even on Users page
  useEffect(() => {
    if (!session?.user) return;
    let stopped = false;
    const sendHeartbeat = async () => {
      try {
        await fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coords: geo || undefined,
            ip: publicIp || undefined,
          }),
        });
        // Immediately refresh table to reduce status delay
        await load();
      } catch { }
    };
    sendHeartbeat();
    const id = setInterval(() => {
      if (!stopped) sendHeartbeat();
    }, 10000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
    };
    const onBeforeUnload = () => {
      try {
        navigator.sendBeacon(
          '/api/presence',
          JSON.stringify({ offline: true })
        );
      } catch { }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [session?.user, geo, publicIp, load]);

  // Fetch public IP (best-effort) once with fallbacks
  useEffect(() => {
    let mounted = true;
    const resolveIp = async (): Promise<string | null> => {
      const endpoints = [
        'https://api.ipify.org?format=json',
        'https://api64.ipify.org?format=json',
      ];
      for (const url of endpoints) {
        try {
          const c = new AbortController();
          const to = setTimeout(() => c.abort(), 3000);
          const r = await fetch(url, { signal: c.signal });
          clearTimeout(to);
          if (!r.ok) continue;
          const j = await r.json();
          if (j?.ip) return j.ip as string;
        } catch { }
      }
      return null;
    };
    (async () => {
      const ip = await resolveIp();
      if (mounted && ip) setPublicIp(ip);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Faster polling for users table (every 3s)
  useEffect(() => {
    if (!session?.user) return;
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [session?.user, load]);

  const rows = useMemo(() => {
    const list = tab === 'live' ? liveUsers : allUsers;
    // Ensure IP shows: allow multiple possible field names
    return list.map((u: any) => ({
      ...u,
      ip: u.ip || u.lastIp || u.lastIP || u.clientIp || '-',
    }));
  }, [tab, liveUsers, allUsers]);

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <div className="flex items-center gap-2">
          <Button
            variant={tab === 'live' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('live')}
          >
            Live (15m)
          </Button>
          <Button
            variant={tab === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('all')}
          >
            All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={updating}
          >
            {updating ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {tab === 'live' ? 'Live Users (last 15m)' : 'All Users'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Tenant</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Last Login</th>
                  <th className="py-2 pr-4">Last Seen</th>
                  <th className="py-2 pr-4">IP</th>
                  <th className="py-2 pr-4">Location</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="py-4" colSpan={9}>
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="py-4" colSpan={9}>
                      No users to display.
                    </td>
                  </tr>
                ) : (
                  rows.map((u, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2 pr-4">{u.name || '-'}</td>
                      <td className="py-2 pr-4">{u.email}</td>
                      <td className="py-2 pr-4">{u.tenantId || '-'}</td>
                      <td className="py-2 pr-4">{u.role || '-'}</td>
                      <td className="py-2 pr-4">
                        {u.isActive ? (
                          <Badge variant="default">Live</Badge>
                        ) : (
                          <Badge variant="secondary">Offline</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {formatDateTime(u.lastLogin)}
                      </td>
                      <td className="py-2 pr-4">
                        {formatDateTime(u.lastSeen)}
                      </td>
                      <td className="py-2 pr-4">{u.ip || '-'}</td>
                      <td className="py-2 pr-4">
                        {formatLocation(u.lastLocation)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function normalizeUser(u: any): UserRow {
  // Live only if explicitly active AND seen within 20s (match server)
  let active = u.isActive === true;
  try {
    if (u.lastSeen) {
      const seen = new Date(u.lastSeen).getTime();
      const recent = Date.now() - seen <= 20 * 1000;
      active = active && recent;
    } else {
      active = false;
    }
  } catch { }
  return {
    name: u.name,
    email: u.email,
    tenantId: u.tenantId,
    role: u.role,
    lastLogin: toIso(u.lastLogin),
    lastSeen: toIso(u.lastSeen),
    isActive: active,
    ip: u.ip,
    lastLocation: u.lastLocation,
  };
}

function toIso(v: any): string | undefined {
  if (!v) return undefined;
  try {
    const d = typeof v === 'string' ? new Date(v) : v;
    return new Date(d).toISOString();
  } catch {
    return undefined;
  }
}

function formatDateTime(v?: string) {
  if (!v) return '-';
  try {
    const d = new Date(v);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  } catch {
    return v;
  }
}

function formatLocation(loc?: {
  lat?: number;
  lng?: number;
  city?: string;
  country?: string;
}) {
  if (!loc) return '-';
  const parts: string[] = [];
  if (loc.city) parts.push(loc.city);
  if (loc.country) parts.push(loc.country);
  if (loc.lat != null && loc.lng != null)
    parts.push(`(${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`);
  return parts.join(', ') || '-';
}
