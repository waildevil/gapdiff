'use client';

import Link from 'next/link';
import { useIsLive } from './LiveStatusProvider';
import styles from './LiveDot.module.css';

export function LiveDot({
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
      className={styles.dot}
      href={`/player/${platform}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}/live`}
      title="In a live game — click to spectate"
      aria-label="In a live game — click to spectate"
      onClick={(e) => e.stopPropagation()}
    />
  );
}
