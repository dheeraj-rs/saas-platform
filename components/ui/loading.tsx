import { cn } from '@/lib/utils';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Loading({ size = 'md', className }: LoadingProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div
        className={cn(
          'animate-spin rounded-full border-2 border-gray-300 border-t-blue-600',
          sizeClasses[size]
        )}
      />
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loading size="lg" />
        <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export function ComponentLoading({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="text-center">
        <Loading />
        {children && <p className="mt-2 text-sm text-muted-foreground">{children}</p>}
      </div>
    </div>
  );
}