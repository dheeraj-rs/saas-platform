import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      tenantId: string;
      role: string;
    };
    accessToken?: string;
  }

  interface User {
    id: string;
    email: string;
    name: string;
    tenantId: string;
    role: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    tenantId: string;
    role: string;
  }
}