'use client';

import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'gapdiff-theme';

/**
 * The inline script in the layout has already applied a theme by the time this
 * mounts, so the component reads the current value off <html> rather than
 * guessing — which also avoids a hydration mismatch.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing can refuse storage; the theme still applies for now.
    }
  }

  // Server render and first client render agree on this, then it swaps in.
  if (theme === null) return <span className={styles.placeholder} aria-hidden="true" />;

  const goingToLight = theme === 'dark';

  return (
    <button
      className={styles.toggle}
      onClick={toggle}
      title={goingToLight ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={goingToLight ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {goingToLight ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  );
}
