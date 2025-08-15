import jwt, { JwtPayload } from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getTenantDatabase } from './db';
import { User } from './models/user';

const JWT_SECRET =
  process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export interface CustomJWTPayload extends JwtPayload {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
  sessionId: string;
}

// Generate JWT tokens
export function generateTokens(user: User) {
  const payload = {
    userId:
      typeof (user as any)._id === 'string'
        ? (user as any)._id
        : String((user as any)._id),
    tenantId: user.tenantId,
    role: user.role,
    permissions: user.permissions,
    sessionId: generateSessionId(),
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: 'enterprise-saas',
    audience: user.tenantId,
  });

  const refreshToken = jwt.sign({ ...payload, type: 'refresh' }, JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    issuer: 'enterprise-saas',
    audience: user.tenantId,
  });

  return { accessToken, refreshToken };
}

// Verify JWT token
export function verifyToken(token: string): CustomJWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as CustomJWTPayload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// Verify password
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

// Generate session ID
export function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Check account lockout
export async function isAccountLocked(
  user: { lockoutUntil?: Date } | any
): Promise<boolean> {
  if (user.lockoutUntil && user.lockoutUntil > new Date()) {
    return true;
  }
  return false;
}

// Update login attempts
export async function updateLoginAttempts(
  userId: string,
  tenantId: string,
  success: boolean
) {
  const db = await getTenantDatabase(tenantId);
  const users = db.collection('users');

  if (success) {
    // Reset on successful login
    await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          loginAttempts: 0,
          lastLogin: new Date(),
        },
        $unset: { lockoutUntil: 1 },
      }
    );
  } else {
    // Increment failed attempts
    const user = await users.findOne({ _id: new ObjectId(userId) });
    if (user) {
      const newAttempts = (user.loginAttempts || 0) + 1;
      const lockoutTime =
        newAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null; // 30 min lockout

      await users.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            loginAttempts: newAttempts,
            ...(lockoutTime && { lockoutUntil: lockoutTime }),
          },
        }
      );
    }
  }
}

// NextAuth configuration
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        tenantId: { label: 'Tenant ID', type: 'text' },
      },
      async authorize(credentials) {
        if (
          !credentials?.email ||
          !credentials?.password ||
          !credentials?.tenantId
        ) {
          throw new Error('Missing required credentials');
        }

        try {
          const db = await getTenantDatabase(credentials.tenantId);
          const user = await db
            .collection('users')
            .findOne({ email: credentials.email });

          if (!user) {
            throw new Error('Invalid credentials');
          }

          if (await isAccountLocked(user)) {
            throw new Error(
              'Account is locked due to too many failed login attempts'
            );
          }

          const isValid = await verifyPassword(
            credentials.password,
            user.password
          );

          if (isValid) {
            await updateLoginAttempts(
              String(user._id),
              credentials.tenantId,
              true
            );
            return {
              id: String(user._id),
              email: user.email,
              name: user.name,
              tenantId: user.tenantId,
              role: user.role,
            };
          } else {
            await updateLoginAttempts(
              String(user._id),
              credentials.tenantId,
              false
            );
            throw new Error('Invalid credentials');
          }
        } catch (error) {
          console.error('Auth error:', error);
          throw error;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 15 * 60, // 15 minutes
  },
  jwt: {
    secret: JWT_SECRET,
    maxAge: 15 * 60, // 15 minutes
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.tenantId = (user as any).tenantId;
        token.role = (user as any).role || token.role || 'user';
        // ensure email is present on token for downstream lookups
        if (!token.email) token.email = user.email as string;
      }
      // Resolve role immediately from env lists to avoid first-login delay
      if (token.email) {
        const superAdmins = (process.env.SUPERADMIN_EMAILS || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const admins = (process.env.ADMIN_EMAILS || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const emailLc = (token.email as string).toLowerCase();
        if (superAdmins.includes(emailLc)) token.role = 'superadmin';
        else if (admins.includes(emailLc)) token.role = 'admin';
      }
      // Always sync role from DB by email (covers promotions/demotions)
      if (token.email) {
        try {
          const tenantId = (token.tenantId as string) || 'demo';
          const db = await getTenantDatabase(tenantId);
          const u = await db
            .collection('users')
            .findOne({ email: token.email });
          if (u?.role) token.role = u.role;
        } catch {}
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.userId as string,
        tenantId: (token.tenantId as string) || 'demo',
        role: token.role as string,
      };
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Route users after sign-in based on role
      try {
        const u = new URL(url, baseUrl);
        // If already an absolute path inside site, keep it
        if (u.origin === baseUrl) {
          return url;
        }
      } catch {}
      // Fallback by reading role from URL params is not reliable here; default home
      return baseUrl;
    },
  },
  events: {
    // Mark user active on any successful sign-in (e.g., Google)
    async signIn({ user, account }) {
      try {
        const tenantId = (user as any).tenantId || 'demo';
        const db = await getTenantDatabase(tenantId);
        // Decide role from env lists on every sign-in
        const superAdmins = (process.env.SUPERADMIN_EMAILS || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const admins = (process.env.ADMIN_EMAILS || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const emailLc = (user.email || '').toLowerCase();
        const resolvedRole = superAdmins.includes(emailLc)
          ? 'superadmin'
          : admins.includes(emailLc)
          ? 'admin'
          : undefined;

        const update: any = {
          $set: {
            lastLogin: new Date(),
            isActive: true,
            name: user.name,
            tenantId,
          },
        };
        if (resolvedRole) {
          update.$set.role = resolvedRole;
        } else {
          update.$setOnInsert = { role: 'user' };
        }
        await db
          .collection('users')
          .updateOne({ email: user.email }, update, { upsert: true });
        // Backfill role to 'user' for existing accounts that predate role assignment
        if (!resolvedRole) {
          await db
            .collection('users')
            .updateOne(
              {
                email: user.email,
                $or: [{ role: { $exists: false } }, { role: null }],
              },
              { $set: { role: 'user' } }
            );
        }
        // Log login activity for dashboard
        try {
          await db.collection('userActivities').insertOne({
            type: 'login',
            userEmail: user.email,
            userId: (user as any).id,
            tenantId,
            timestamp: new Date(),
          });
        } catch {}
      } catch (e) {
        console.error('events.signIn update failed:', e);
      }
    },
    // Optionally mark inactive on sign out
    async signOut({ session }) {
      try {
        const tenantId = (session?.user as any)?.tenantId || 'demo';
        const email = session?.user?.email;
        if (!email) return;
        const db = await getTenantDatabase(tenantId);
        await db
          .collection('users')
          .updateOne(
            { email },
            { $set: { isActive: false, lastSeen: new Date() } }
          );
        // Log logout activity for dashboard
        try {
          await db.collection('userActivities').insertOne({
            type: 'logout',
            userEmail: email,
            userId: (session?.user as any)?.id,
            tenantId,
            timestamp: new Date(),
          });
        } catch {}
      } catch (e) {
        console.error('events.signOut update failed:', e);
      }
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  secret: JWT_SECRET,
};
