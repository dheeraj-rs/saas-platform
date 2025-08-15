import { NextRequest, NextResponse } from 'next/server';
import { getSharedDatabase, getTenantDatabase, initializeDatabaseIndexes } from '@/lib/db';
import { withRateLimit, adminRateLimit } from '@/lib/rateLimiter';
import { verifyToken } from '@/lib/auth';
import { Tenant, User } from '@/lib/models/user';
import { generateSecureToken } from '@/lib/encryption';

// Get tenants (Super Admin only)
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
      if (!payload || payload.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Insufficient privileges' },
          { status: 403 }
        );
      }

      const sharedDb = await getSharedDatabase();
      const tenants = await sharedDb.collection<Tenant>('tenants')
        .find({}, { 
          projection: { 
            _id: 1, 
            name: 1, 
            slug: 1, 
            domain: 1,
            plan: 1,
            isActive: 1,
            createdAt: 1,
            usage: 1
          } 
        })
        .sort({ createdAt: -1 })
        .toArray();

      return NextResponse.json({
        success: true,
        tenants,
      });

    } catch (error) {
      console.error('Get tenants error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

// Create new tenant
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
      if (!payload || payload.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Insufficient privileges' },
          { status: 403 }
        );
      }

      const {
        name,
        slug,
        domain,
        plan = 'starter',
        adminUser
      } = await request.json();

      if (!name || !slug || !adminUser?.email || !adminUser?.name) {
        return NextResponse.json(
          { error: 'Missing required fields' },
          { status: 400 }
        );
      }

      // Validate slug format
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return NextResponse.json(
          { error: 'Slug must contain only lowercase letters, numbers, and hyphens' },
          { status: 400 }
        );
      }

      const sharedDb = await getSharedDatabase();
      
      // Check if tenant already exists
      const existingTenant = await sharedDb.collection('tenants').findOne({
        $or: [{ slug }, { domain }]
      });

      if (existingTenant) {
        return NextResponse.json(
          { error: 'Tenant with this slug or domain already exists' },
          { status: 409 }
        );
      }

      // Create tenant record
      const newTenant: Omit<Tenant, '_id'> = {
        name,
        slug,
        domain,
        plan: plan as 'starter' | 'professional' | 'enterprise',
        usage: {
          users: 1, // Initial admin user
          storage: 0,
          apiRequests: 0,
          lastCalculated: new Date(),
        },
        settings: {
          allowUserRegistration: true,
          requireEmailVerification: false,
          requireMfa: false,
          sessionTimeout: 15, // minutes
          maxUsers: plan === 'starter' ? 10 : plan === 'professional' ? 100 : 1000,
          allowedDomains: domain ? [domain] : undefined,
        },
        security: {
          enforceStrongPasswords: true,
          passwordExpiryDays: 90,
          maxLoginAttempts: 5,
          lockoutDurationMinutes: 30,
          requireSsl: true,
          enableAuditLogging: true,
        },
        isActive: true,
        isSuspended: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        dataRetentionPeriod: 365, // days
      };

      const tenantResult = await sharedDb.collection('tenants').insertOne(newTenant);
      const tenantId = tenantResult.insertedId.toString();

      // Initialize tenant database
      await initializeDatabaseIndexes(tenantId);

      // Create admin user for the tenant
      const tenantDb = await getTenantDatabase(tenantId);
      const bcrypt = require('bcryptjs');
      
      const tempPassword = generateSecureToken(12);
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      const adminUserDoc: Omit<User, '_id'> = {
        tenantId,
        email: adminUser.email,
        password: hashedPassword,
        name: adminUser.name,
        role: 'admin',
        permissions: [
          'user:read', 'user:create', 'user:update',
          'tenant:read', 'tenant:update',
          'dashboard:read', 'dashboard:update', 'dashboard:manage',
          'analytics:read', 'analytics:export',
          'security:read', 'security:alerts',
          'audit:read'
        ],
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
        createdBy: payload.userId,
        consentGiven: true,
        consentDate: new Date(),
      };

      await tenantDb.collection('users').insertOne(adminUserDoc);

      // Log audit event
      await tenantDb.collection('auditLogs').insertOne({
        tenantId,
        userId: payload.userId,
        action: 'tenant_created',
        resource: 'tenant',
        details: {
          tenantName: name,
          slug,
          plan,
          adminEmail: adminUser.email,
        },
        ipAddress: request.ip || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        requestId: crypto.randomUUID(),
        success: true,
        severity: 'medium',
        category: 'admin',
        timestamp: new Date(),
        retainUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      return NextResponse.json({
        success: true,
        tenant: {
          id: tenantId,
          name,
          slug,
          domain,
          plan,
        },
        adminCredentials: {
          email: adminUser.email,
          tempPassword, // In production, this would be sent via email
        },
      });

    } catch (error) {
      console.error('Create tenant error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

// Update tenant
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
      if (!payload) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        );
      }

      const {
        tenantId,
        name,
        domain,
        plan,
        settings,
        security,
        isActive,
        isSuspended,
        suspensionReason
      } = await request.json();

      if (!tenantId) {
        return NextResponse.json(
          { error: 'Tenant ID required' },
          { status: 400 }
        );
      }

      // Check permissions
      const canUpdate = payload.role === 'super_admin' || 
                       (payload.role === 'admin' && payload.tenantId === tenantId);

      if (!canUpdate) {
        return NextResponse.json(
          { error: 'Insufficient privileges' },
          { status: 403 }
        );
      }

      const sharedDb = await getSharedDatabase();
      
      const updateData: Partial<Tenant> = {
        updatedAt: new Date(),
      };

      // Only super admin can modify certain fields
      if (payload.role === 'super_admin') {
        if (name !== undefined) updateData.name = name;
        if (domain !== undefined) updateData.domain = domain;
        if (plan !== undefined) updateData.plan = plan;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (isSuspended !== undefined) updateData.isSuspended = isSuspended;
        if (suspensionReason !== undefined) updateData.suspensionReason = suspensionReason;
      }

      // Both super admin and tenant admin can modify settings
      if (settings) updateData.settings = settings;
      if (security) updateData.security = security;

      const result = await sharedDb.collection('tenants').updateOne(
        { _id: tenantId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 404 }
        );
      }

      // Log audit event
      const tenantDb = await getTenantDatabase(tenantId);
      await tenantDb.collection('auditLogs').insertOne({
        tenantId,
        userId: payload.userId,
        action: 'tenant_updated',
        resource: 'tenant',
        details: updateData,
        ipAddress: request.ip || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        requestId: crypto.randomUUID(),
        success: true,
        severity: 'medium',
        category: 'admin',
        timestamp: new Date(),
        retainUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      return NextResponse.json({
        success: true,
        message: 'Tenant updated successfully',
      });

    } catch (error) {
      console.error('Update tenant error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

// Delete tenant (Super Admin only)
export async function DELETE(request: NextRequest) {
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
      if (!payload || payload.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'Insufficient privileges' },
          { status: 403 }
        );
      }

      const { tenantId } = await request.json();

      if (!tenantId) {
        return NextResponse.json(
          { error: 'Tenant ID required' },
          { status: 400 }
        );
      }

      const sharedDb = await getSharedDatabase();
      
      // Get tenant info before deletion
      const tenant = await sharedDb.collection('tenants').findOne({ _id: tenantId });
      
      if (!tenant) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 404 }
        );
      }

      // Mark as suspended first (soft delete)
      await sharedDb.collection('tenants').updateOne(
        { _id: tenantId },
        { 
          $set: { 
            isSuspended: true,
            suspensionReason: 'Deleted by super admin',
            updatedAt: new Date()
          }
        }
      );

      // Schedule for hard deletion after retention period
      // In a real system, this would be handled by a background job

      return NextResponse.json({
        success: true,
        message: 'Tenant marked for deletion',
      });

    } catch (error) {
      console.error('Delete tenant error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}