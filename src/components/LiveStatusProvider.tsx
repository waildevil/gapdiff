'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface LivePlayerKey {
  platform: string;
  puuid: string;
}

const LiveStatusContext = createContext<Set<string>>(new Set());

const POLL_MS = 20_000;

function statusKey(platform: string, puuid: string): string {
  return `${platform}:${puuid}`;
}

/**
 * Polls the batched `/api/live-status` endpoint for every player under it and
 * makes the result available to any `LiveDot` in its subtree — one interval
 * per list (standings, friends) instead of one per row.
 */
export function LiveStatusProvider({
  players,
  children,
}: {
  players: LivePlayerKey[];
  children: ReactNode;
}) {
  const [live, setLive] = useState<Set<string>>(new Set());
  // Keys, not the array reference, drive re-polling — the caller rebuilds
  // `players` fresh on every render.
  const key = players.map((p) => statusKey(p.platform, p.puuid)).join(',');
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    if (key === '') return;
    let cancelled = false;

    async function poll() {
      const response = await fetch('/api/live-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: playersRef.current }),
      }).catch(() => null);
      if (cancelled || !response?.ok) return;

      const data = (await response.json().catch(() => ({}))) as Record<string, boolean>;
      setLive(new Set(Object.entries(data).filter(([, inGame]) => inGame).map(([k]) => k)));
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [key]);

  return <LiveStatusContext.Provider value={live}>{children}</LiveStatusContext.Provider>;
}

export function useIsLive(platform: string, puuid: string): boolean {
  const live = useContext(LiveStatusContext);
  return live.has(statusKey(platform, puuid));
}
