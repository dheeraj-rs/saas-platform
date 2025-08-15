import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET });

  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/users');

  // Protect dashboard and users to admin/superadmin
  if (isProtected) {
    if (!token) {
      const url = new URL('/auth/login', req.url);
      return NextResponse.redirect(url);
    }
    const role = (token as any).role as string | undefined;
    if (role === 'admin' || role === 'superadmin') {
      return NextResponse.next();
    }
    const url = new URL('/welcome', req.url);
    return NextResponse.redirect(url);
  }

  // Smart root redirect
  if (pathname === '/' || pathname === '/home') {
    if (token) {
      const role = (token as any).role as string | undefined;
      const target = role === 'admin' || role === 'superadmin' ? '/dashboard' : '/welcome';
      return NextResponse.redirect(new URL(target, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/home', '/dashboard/:path*', '/users/:path*'],
};
