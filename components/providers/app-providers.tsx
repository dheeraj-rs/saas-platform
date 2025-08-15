'use client';

import React from 'react';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { I18nextProvider } from 'react-i18next';
import i18n, { initI18n } from '@/i18n/config';

export function AppProviders({ children }: { children: React.ReactNode }) {
  // Ensure i18n is initialized once on the client
  initI18n();
  return (
    <SessionProvider>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </I18nextProvider>
    </SessionProvider>
  );
}
