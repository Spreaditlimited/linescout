'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';

export default function ThemeToggle({
  lightSurface = false,
}: {
  lightSurface?: boolean;
}) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className={`relative h-10 w-10 rounded-full border-0 bg-transparent transition-colors hover:bg-transparent ${
        lightSurface
          ? 'text-slate-700 hover:text-slate-950 dark:text-slate-200 dark:hover:text-white'
          : 'text-white/90 hover:text-white'
      }`}
      aria-label="Toggle light and dark mode"
      title="Toggle light and dark mode"
    >
      <Sun className="h-4 w-4 dark:hidden" aria-hidden="true" />
      <Moon className="hidden h-4 w-4 dark:block" aria-hidden="true" />
    </Button>
  );
}
