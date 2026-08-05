'use client';

import Link from 'next/link';
import { useIsLive } from './LiveStatusProvider';

/** The profile page's "in a game right now" chip — polled client-side so it
 *  isn't frozen behind the page's 60s ISR cache the way a server check would be. */
export function LiveBanner({
  platform,
  puuid,
  gameName,
  tagLine,
}: {
  platform: string;
  puuid: string;
  gameName: string;
  tagLine: string;
}) {
  const live = useIsLive(platform, puuid);
  if (!live) return null;

  return (
    <Link
      href={`/player/${platform}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}/live`}
      className="chip good"
      style={{ textDecoration: 'none', gap: 6 }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: 'var(--good)',
          display: 'inline-block',
        }}
      />
      Live now · spectate
    </Link>
  );
}
