import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getTenantDatabase, getSharedDatabase } from '@/lib/db';
import { withRateLimit, authRateLimit } from '@/lib/rateLimiter';
import { generateTokens, updateLoginAttempts, isAccountLocked } from '@/lib/auth';
import { checkPasswordBreach } from '@/lib/encryption';
import { User, AuditLog } from '@/lib/models/user';

// Login endpoint
export async function POST(request: NextRequest) {
  return withRateLimit(authRateLimit, request, async () => {
    try {
      const { email, password, tenantId, mfaCode } = await request.json();

      if (!email || !password || !tenantId) {
        return NextResponse.json(
          { error: 'Missing required credentials' },
          { status: 400 }
        );
      }

      const tenantDb = await getTenantDatabase(tenantId);
      const user = await tenantDb.collection<User>('users').findOne({ email });

      if (!user) {
        // Log failed attempt
        await logAuditEvent(tenantId, null, 'auth_failed', 'login', {
          email,
          reason: 'user_not_found',
        }, request);

        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      // Check account lockout
      if (await isAccountLocked(user)) {
        await logAuditEvent(tenantId, user._id?.toString(), 'auth_blocked', 'login', {
          reason: 'account_locked',
        }, request);

        return NextResponse.json(
          { error: 'Account locked due to too many failed attempts' },
          { status: 423 }
        );
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password || '');

      if (!isValidPassword) {
        await updateLoginAttempts(user._id?.toString() || '', tenantId, false);
        
        await logAuditEvent(tenantId, user._id?.toString(), 'auth_failed', 'login', {
          reason: 'invalid_password',
        }, request);

        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      // Check MFA if enabled
      if (user.mfaEnabled) {
        if (!mfaCode) {
          return NextResponse.json(
            { error: 'MFA code required', requireMfa: true },
            { status: 200 }
          );
        }

        const isValidMfa = await verifyMfaCode(user, mfaCode);
        if (!isValidMfa) {
          await logAuditEvent(tenantId, user._id?.toString(), 'auth_failed', 'mfa', {
            reason: 'invalid_mfa_code',
          }, request);

          return NextResponse.json(
            { error: 'Invalid MFA code' },
            { status: 401 }
          );
        }
      }

      // Successful login
      await updateLoginAttempts(user._id?.toString() || '', tenantId, true);
      const tokens = generateTokens(user);

      // Create session record
      await createSession(user, tokens, request);

      await logAuditEvent(tenantId, user._id?.toString(), 'auth_success', 'login', {
        mfaUsed: user.mfaEnabled,
      }, request);

      return NextResponse.json({
        success: true,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        },
        tokens,
      });

    } catch (error) {
      console.error('Login error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

// Register endpoint
export async function PUT(request: NextRequest) {
  return withRateLimit(authRateLimit, request, async () => {
    try {
      const { email, password, name, tenantId } = await request.json();

      if (!email || !password || !name || !tenantId) {
        return NextResponse.json(
          { error: 'Missing required fields' },
          { status: 400 }
        );
      }

      // Check password strength
      if (password.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 }
        );
      }

      // Check for breached password
      const isBreached = await checkPasswordBreach(password);
      if (isBreached) {
        return NextResponse.json(
          { error: 'This password has been found in data breaches. Please choose a different password.' },
          { status: 400 }
        );
      }

      const tenantDb = await getTenantDatabase(tenantId);
      
      // Check if user already exists
      const existingUser = await tenantDb.collection('users').findOne({ email });
      if (existingUser) {
        return NextResponse.json(
          { error: 'User already exists' },
          { status: 409 }
        );
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const newUser: Omit<User, '_id'> = {
        tenantId,
        email,
        password: hashedPassword,
        name,
        role: 'user',
        permissions: ['dashboard:read', 'dashboard:update'],
        isActive: true,
        mfaEnabled: false,
        loginAttempts: 0,
        passwordLastChanged: new Date(),
        preferences: {
          theme: 'system',
          language: 'en',
          timezone: 'UTC',
          dateFormat: 'YYYY-MM-DD',
          notifications: {
            email: true,
            push: true,
            sms: false,
            security: true,
            marketing: false,
          },
          dashboard: {
            layout: 'grid',
            widgetsPerRow: 3,
            showWelcome: true,
            compactMode: false,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        consentGiven: true,
        consentDate: new Date(),
      };

      const result = await tenantDb.collection('users').insertOne(newUser);

      await logAuditEvent(tenantId, result.insertedId.toString(), 'user_created', 'registration', {
        email,
        name,
      }, request);

      return NextResponse.json({
        success: true,
        message: 'User created successfully',
      });

    } catch (error) {
      console.error('Registration error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

// Refresh token endpoint
export async function PATCH(request: NextRequest) {
  try {
    const { refreshToken } = await request.json();

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token required' },
        { status: 400 }
      );
    }

    // Verify refresh token
    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET!) as any;
    
    if (payload.type !== 'refresh') {
      return NextResponse.json(
        { error: 'Invalid token type' },
        { status: 401 }
      );
    }

    const tenantDb = await getTenantDatabase(payload.tenantId);
    const user = await tenantDb.collection<User>('users').findOne({ 
      _id: payload.userId 
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'User not found or inactive' },
        { status: 401 }
      );
    }

    // Generate new tokens
    const tokens = generateTokens(user);

    return NextResponse.json({
      success: true,
      tokens,
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Invalid refresh token' },
      { status: 401 }
    );
  }
}

// Helper functions
async function verifyMfaCode(user: User, code: string): Promise<boolean> {
  // Implementation would depend on MFA method (TOTP, SMS, etc.)
  // For now, return a simple check
  const speakeasy = require('speakeasy');
  
  if (user.mfaSecret) {
    return speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });
  }

  return false;
}

async function createSession(user: User, tokens: any, request: NextRequest) {
  const tenantDb = await getTenantDatabase(user.tenantId);
  
  const session = {
    userId: user._id?.toString(),
    tenantId: user.tenantId,
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    deviceInfo: {
      type: 'desktop', // Would parse user agent
      os: 'unknown',
      browser: 'unknown',
      fingerprint: 'unknown',
    },
    ipAddress: request.ip || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    geolocation: {
      country: request.headers.get('cf-ipcountry') || 'unknown',
      city: 'unknown',
      latitude: 0,
      longitude: 0,
      timezone: 'UTC',
    },
    isActive: true,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    lastActivity: new Date(),
    createdAt: new Date(),
  };

  await tenantDb.collection('sessions').insertOne(session);
}

async function logAuditEvent(
  tenantId: string,
  userId: string | null | undefined,
  action: string,
  resource: string,
  details: any,
  request: NextRequest
) {
  try {
    const tenantDb = await getTenantDatabase(tenantId);
    
    const auditLog: Omit<AuditLog, '_id'> = {
      tenantId,
      userId: userId || undefined,
      action,
      resource,
      details,
      ipAddress: request.ip || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      requestId: crypto.randomUUID(),
      success: action.includes('success'),
      severity: action.includes('failed') || action.includes('blocked') ? 'high' : 'low',
      category: 'auth',
      timestamp: new Date(),
      retainUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    };

    await tenantDb.collection('auditLogs').insertOne(auditLog);
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}