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
  
  // Analytics
  ANALYTICS_READ: 'analytics:read',
  ANALYTICS_EXPORT: 'analytics:export',
  
  // Security
  SECURITY_READ: 'security:read',
  SECURITY_MANAGE: 'security:manage',
  
  // Audit Logs
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',
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
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.ANALYTICS_EXPORT,
    PERMISSIONS.SECURITY_READ,
    PERMISSIONS.AUDIT_READ,
  ],
  user: [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.DASHBOARD_UPDATE,
  ],
} as const;

export function hasPermission(userPermissions: string[], requiredPermission: string): boolean {
  return userPermissions.includes(requiredPermission);
}

export function hasAnyPermission(userPermissions: string[], requiredPermissions: string[]): boolean {
  return requiredPermissions.some(permission => userPermissions.includes(permission));
}

export function hasAllPermissions(userPermissions: string[], requiredPermissions: string[]): boolean {
  return requiredPermissions.every(permission => userPermissions.includes(permission));
}