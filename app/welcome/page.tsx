"use client";
import React from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

export default function WelcomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // If an admin somehow lands here, push to dashboard
  React.useEffect(() => {
    if (status !== 'authenticated') return;
    const role = (session?.user as any)?.role as string | undefined;
    if (role === 'admin' || role === 'superadmin') {
      router.replace('/dashboard');
    }
  }, [status, session?.user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-xl w-full space-y-4 text-center">
        <h1 className="text-3xl font-bold">Welcome</h1>
        <p className="text-muted-foreground">
          You are signed in as <strong>{session?.user?.email}</strong>.
        </p>
        <p>
          Your role is <strong>{(session?.user as any)?.role || 'user'}</strong>.
        </p>
        <p className="text-sm text-muted-foreground">
          Regular users land here. If you need dashboard access, contact an administrator.
        </p>
        <div className="pt-4">
          <button
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm"
            onClick={async () => {
              try {
                await fetch('/api/presence', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ offline: true }),
                });
              } catch {}
              await signOut({ callbackUrl: '/auth/login' });
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
