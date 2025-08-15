'use client';
import React, { useEffect, useState } from 'react';
// import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { hasPermission, UserRole } from '@/lib/roles';
import InitialLoader from '@/components/ui/Loader/InitialLoader';

interface RoleBasedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requiredRole?: UserRole;
}

export const RoleBasedRoute: React.FC<RoleBasedRouteProps> = ({
  children,
  fallback,
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const hasRoutePermission = hasPermission(pathname, user.role as UserRole);
      if (!hasRoutePermission) {
        router.push('/');
      }
    }
  }, [isAuthenticated, isLoading, user, pathname, router]);

  if (!isClient) {
    return null;
  }

  if (isLoading) {
    return fallback || <InitialLoader />;
  }

  if (isAuthenticated && user) {
    const hasRoutePermission = hasPermission(pathname, user.role as UserRole);
    if (hasRoutePermission) {
      return <>{children}</>;
    } else {
      return (
        <div className="role-based-route-error">
          <div className="role-based-route-error-content">
            <div className="role-based-route-error-icon">
              <i className="pi pi-lock"></i>
            </div>
            <h1>Access Denied</h1>
            <p>
              You don&apos;t have permission to access this page.
              {user.role && (
                <span className="role-based-route-user-role">
                  Your role:{' '}
                  <span className="role-based-route-role-name">
                    {user.role}
                  </span>
                </span>
              )}
            </p>
            <button
              onClick={() => router.push('/')}
              className="role-based-route-dashboard-btn"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      );
    }
  }

  if (!isAuthenticated) {
    router.push('/auth/login-pin');
    return null;
  }
  return null;
};
