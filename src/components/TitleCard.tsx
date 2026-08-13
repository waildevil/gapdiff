'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { LeaderboardPlayer, StatBoardResult } from '@/lib/leaderboard';
import { PlayerAvatar } from './PlayerAvatar';
import styles from './AwardsBoard.module.css';

function profileHref(player: { platform: string; gameName: string; tagLine: string }) {
  return `/player/${player.platform}/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`;
}

const FALLBACK_PLAYER = { ownerImage: null, profileIconId: null } as const;

/**
 * Collapsed: this week's leader, if any. Expanded (click the head): every
 * group member ranked on this board, so the gap to the leader is visible
 * too, not just who's on top. See src/lib/titles.ts for how a title is won.
 */
export function TitleCard({
  board,
  players,
  version,
}: {
  board: StatBoardResult;
  players: LeaderboardPlayer[];
  version: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const byPuuid = new Map(players.map((p) => [p.puuid, p]));
  const holder = board.rows.find((row) => row.holdsTitle);
  const ranked = [...board.rows].sort((a, b) => a.position - b.position);

  return (
    <div className={`card ${styles.titleCard} ${!holder ? styles.unclaimed : ''}`}>
      <button
        type="button"
        className={styles.cardToggle}
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className={styles.titleCardHead}>
          <span className={styles.titleLabel}>{board.label}</span>
          <span className={styles.titleMetric}>{board.metricLabel}</span>
          <span className={styles.expandHint}>{expanded ? 'hide ranking' : 'show ranking'}</span>
        </div>

        {!expanded ? (
          holder ? (
            <div className={styles.titleHolder}>
              <PlayerAvatar player={byPuuid.get(holder.puuid) ?? { ...FALLBACK_PLAYER, gameName: holder.gameName }} version={version} />
              <div className={styles.titleHolderInfo}>
                <span className={styles.titleHolderName}>{holder.gameName}</span>
                <span className={styles.titleHolderValue}>{holder.formatted}</span>
              </div>
            </div>
          ) : (
            <div className={styles.unclaimedRow}>nobody leads this week</div>
          )
        ) : null}
      </button>

      {holder?.takenFrom && !expanded ? (
        <div className={styles.takenFrom}>taken from {holder.takenFrom}</div>
      ) : null}

      {expanded ? (
        <div className={styles.rankedList}>
          {ranked.map((row) => (
            <Link
              key={row.puuid}
              href={profileHref(row)}
              className={`${styles.rankedRow} ${!row.eligible ? styles.rankedIneligible : ''}`}
            >
              <span className={styles.rankedPosition}>{row.position}</span>
              <PlayerAvatar
                player={byPuuid.get(row.puuid) ?? { ...FALLBACK_PLAYER, gameName: row.gameName }}
                version={version}
                size="sm"
              />
              <span className={styles.rankedName}>{row.gameName}</span>
              <span className={styles.rankedValue}>{row.formatted}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
