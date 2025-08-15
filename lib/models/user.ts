import { ObjectId } from 'mongodb';

export interface User {
  _id?: string | ObjectId;
  tenantId: string;
  email: string;
  password?: string; // Hashed password, optional for OAuth users
  name: string;
  avatar?: string;
  role: 'super_admin' | 'admin' | 'user';
  permissions: string[];
  isActive: boolean;
  
  // MFA Configuration
  mfaEnabled: boolean;
  mfaSecret?: string; // TOTP secret
  backupCodes?: string[]; // Encrypted backup codes
  webAuthnCredentials?: WebAuthnCredential[]; // Biometric credentials
  
  // Security tracking
  lastLogin?: Date;
  loginAttempts: number;
  lockoutUntil?: Date;
  passwordLastChanged: Date;
  securityQuestions?: SecurityQuestion[];
  
  // User preferences
  preferences: UserPreferences;
  
  // Audit trail
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string; // User ID who created this user
  
  // GDPR compliance
  dataRetentionDate?: Date;
  consentGiven: boolean;
  consentDate?: Date;
}

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
  counter: number;
  deviceName?: string;
  createdAt: Date;
  lastUsed?: Date;
}

export interface SecurityQuestion {
  question: string;
  answer: string; // Hashed answer
  createdAt: Date;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  dateFormat: string;
  notifications: NotificationPreferences;
  dashboard: DashboardPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  security: boolean;
  marketing: boolean;
}

export interface DashboardPreferences {
  layout: 'grid' | 'list';
  widgetsPerRow: number;
  showWelcome: boolean;
  compactMode: boolean;
}

export interface Tenant {
  _id?: string | ObjectId;
  name: string;
  slug: string;
  domain?: string;
  subdomain?: string;
  
  // Plan and billing
  plan: 'starter' | 'professional' | 'enterprise';
  billingInfo?: BillingInfo;
  usage: TenantUsage;
  
  // Settings
  settings: TenantSettings;
  
  // Security configuration
  security: TenantSecurity;
  
  // Status
  isActive: boolean;
  isSuspended: boolean;
  suspensionReason?: string;
  
  // Audit
  createdAt: Date;
  updatedAt: Date;
  
  // GDPR compliance
  dataRetentionPeriod: number; // Days
}

export interface BillingInfo {
  customerId: string; // Stripe customer ID
  subscriptionId: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
}

export interface TenantUsage {
  users: number;
  storage: number; // Bytes
  apiRequests: number;
  lastCalculated: Date;
}

export interface TenantSettings {
  allowUserRegistration: boolean;
  requireEmailVerification: boolean;
  requireMfa: boolean;
  sessionTimeout: number; // Minutes
  maxUsers: number;
  allowedDomains?: string[]; // For email domain restrictions
  customBranding?: CustomBranding;
}

export interface CustomBranding {
  logo?: string;
  primaryColor: string;
  secondaryColor: string;
  companyName: string;
  customCss?: string;
}

export interface TenantSecurity {
  enforceStrongPasswords: boolean;
  passwordExpiryDays: number;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
  allowedIpRanges?: string[];
  requireSsl: boolean;
  enableAuditLogging: boolean;
}

export interface Session {
  _id?: string | ObjectId;
  userId: string;
  tenantId: string;
  token: string; // JWT token
  refreshToken: string;
  deviceInfo: DeviceInfo;
  
  // Security
  ipAddress: string;
  userAgent: string;
  geolocation?: Geolocation;
  
  // Status
  isActive: boolean;
  expiresAt: Date;
  lastActivity: Date;
  
  // Audit
  createdAt: Date;
}

export interface DeviceInfo {
  type: 'desktop' | 'mobile' | 'tablet';
  os: string;
  browser: string;
  fingerprint: string; // Device fingerprint
}

export interface Geolocation {
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface AuditLog {
  _id?: string | ObjectId;
  tenantId: string;
  userId?: string;
  sessionId?: string;
  
  // Event details
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  
  // Request context
  ipAddress: string;
  userAgent: string;
  requestId: string;
  
  // Result
  success: boolean;
  errorMessage?: string;
  
  // Security classification
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'auth' | 'data' | 'admin' | 'system' | 'security';
  
  // Timestamp
  timestamp: Date;
  
  // Compliance
  retainUntil: Date; // For data retention compliance
}

export interface SecurityAlert {
  _id?: string | ObjectId;
  tenantId: string;
  type: 'suspicious_login' | 'brute_force' | 'data_breach' | 'admin_action' | 'system_anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  
  // Context
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  relatedEvents: string[]; // AuditLog IDs
  
  // Status
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  assignedTo?: string; // Admin user ID
  
  // Timestamps
  detectedAt: Date;
  resolvedAt?: Date;
  
  // Automated response
  autoResponse?: {
    action: 'block_ip' | 'lock_user' | 'require_mfa' | 'notify_admin';
    executedAt: Date;
  };
}

export interface DashboardWidget {
  _id?: string | ObjectId;
  userId: string;
  tenantId: string;
  
  // Widget configuration
  type: 'chart' | 'metric' | 'table' | 'text' | 'custom';
  title: string;
  description?: string;
  
  // Layout
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  
  // Data configuration
  dataSource?: string;
  query?: any;
  refreshInterval?: number; // Seconds
  
  // Display settings
  settings: Record<string, any>;
  
  // Status
  isVisible: boolean;
  
  // Audit
  createdAt: Date;
  updatedAt: Date;
}

// Permission constants
export const PERMISSIONS = {
  // User Management
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  
  // Tenant Management
  TENANT_READ: 'tenant:read',
  TENANT_UPDATE: 'tenant:update',
  TENANT_DELETE: 'tenant:delete',
  
  // Dashboard
  DASHBOARD_READ: 'dashboard:read',
  DASHBOARD_UPDATE: 'dashboard:update',
  DASHBOARD_MANAGE: 'dashboard:manage',
  
  // Analytics
  ANALYTICS_READ: 'analytics:read',
  ANALYTICS_EXPORT: 'analytics:export',
  ANALYTICS_MANAGE: 'analytics:manage',
  
  // Security
  SECURITY_READ: 'security:read',
  SECURITY_MANAGE: 'security:manage',
  SECURITY_ALERTS: 'security:alerts',
  
  // Audit
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',
  
  // System
  SYSTEM_CONFIG: 'system:config',
  SYSTEM_MAINTENANCE: 'system:maintenance',
} as const;

export const ROLE_PERMISSIONS = {
  super_admin: Object.values(PERMISSIONS),
  admin: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.TENANT_READ,
    PERMISSIONS.TENANT_UPDATE,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.DASHBOARD_UPDATE,
    PERMISSIONS.DASHBOARD_MANAGE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.ANALYTICS_EXPORT,
    PERMISSIONS.SECURITY_READ,
    PERMISSIONS.SECURITY_ALERTS,
    PERMISSIONS.AUDIT_READ,
  ],
  user: [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.DASHBOARD_UPDATE,
    PERMISSIONS.USER_READ, // Own profile only
  ],
} as const;