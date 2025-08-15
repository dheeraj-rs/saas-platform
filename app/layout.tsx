import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppProviders } from '@/components/providers/app-providers';
import { PresenceProvider } from '@/components/presence-provider';
import type { Viewport } from 'next';
import '@/styles/index.scss';
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Enterprise SaaS Platform',
  description:
    'Secure multi-tenant enterprise platform with advanced security features',
  keywords: 'enterprise, saas, security, multi-tenant, dashboard',
  authors: [{ name: 'Enterprise SaaS Team' }],
  robots: 'noindex, nofollow', // Security: prevent indexing
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Enterprise SaaS" />
        <meta httpEquiv="X-Frame-Options" content="DENY" />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="Referrer-Policy" content="origin-when-cross-origin" />
      </head>
      <body className={inter.className}>
        <AppProviders>
          <PresenceProvider>
            <div className="min-h-screen bg-background text-foreground">
              {children}
            </div>
          </PresenceProvider>
        </AppProviders>
      </body>
    </html>
  );
}
