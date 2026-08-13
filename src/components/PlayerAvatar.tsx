'use client';

import { useState } from 'react';
import type { LeaderboardPlayer } from '@/lib/leaderboard';
import { profileIcon } from '@/lib/ddragon';
import { Avatar } from './Avatar';
import styles from './AwardsBoard.module.css';

/**
 * Discord avatar when verified, League profile icon otherwise, initials as a
 * last resort. A stale Discord avatar hash 404s once someone changes their
 * picture — `onError` drops down a tier instead of leaving a broken image
 * until they next sign in and resync it (see `events.signIn` in auth.ts).
 */
export function PlayerAvatar({
  player,
  version,
  size = 'md',
}: {
  player: Pick<LeaderboardPlayer, 'gameName' | 'ownerImage' | 'profileIconId'>;
  version: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [discordFailed, setDiscordFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const px = size === 'lg' ? 54 : size === 'sm' ? 28 : 36;

  if (player.ownerImage && !discordFailed) {
    return (
      <img
        className={styles.avatarImg}
        src={player.ownerImage}
        alt=""
        width={px}
        height={px}
        onError={() => setDiscordFailed(true)}
      />
    );
  }
  if (player.profileIconId !== null && !iconFailed) {
    return (
      <img
        className={styles.avatarImg}
        src={profileIcon(version, player.profileIconId)}
        alt=""
        width={px}
        height={px}
        onError={() => setIconFailed(true)}
      />
    );
  }
  return <Avatar name={player.gameName} size={size} />;
}
