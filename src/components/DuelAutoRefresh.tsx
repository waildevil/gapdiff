'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** How often to re-fetch while the duel could still change. */
const POLL_MS = 5_000;

/**
 * Re-fetches this server-rendered page on an interval, so an accept/decline
 * or the duel settling shows up without anyone hitting reload. Stops once
 * `ended` is true — a settled duel is frozen, so polling it forever would
 * just be wasted queries.
 */
export function DuelAutoRefresh({ ended }: { ended: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (ended) return;
    const interval = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(interval);
  }, [ended, router]);

  return null;
}
