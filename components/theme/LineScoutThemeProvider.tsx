'use client';

import { ThemeProvider } from 'next-themes';

export default function LineScoutThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="linescout-theme"
    >
      {children}
    </ThemeProvider>
  );
}
