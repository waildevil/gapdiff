'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Re-fetches this server-rendered page on an interval — for pages where
 * someone else's action (a friend request landing, getting accepted) should
 * show up without you doing anything. See DuelAutoRefresh for the duel-page
 * version, which additionally knows when to stop polling.
 */
export function LiveRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, router]);

  return null;
}
