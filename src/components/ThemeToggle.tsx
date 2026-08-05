'use client';

import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

const STORAGE_KEY = 'gapdiff-theme';

/**
 * Flips `data-theme` on `<html>`, which the CSS tokens in globals.css key
 * off. The initial value comes from the inline script in layout.tsx (see
 * THEME_INIT_SCRIPT there) so there's no flash of the wrong theme before
 * this hydrates — this component only needs to read what's already set.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === 'dark' || current === 'light') {
      setTheme(current);
      return;
    }
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
