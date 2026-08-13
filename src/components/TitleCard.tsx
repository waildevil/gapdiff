'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { StatBoardResult } from '@/lib/leaderboard';
import { Avatar } from './Avatar';
import styles from './AwardsBoard.module.css';

function profileHref(player: { platform: string; gameName: string; tagLine: string }) {
  return `/player/${player.platform}/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`;
}

/**
 * Collapsed: this week's leader, if any. Expanded (click the head): every
 * group member ranked on this board, so the gap to the leader is visible
 * too, not just who's on top. See src/lib/titles.ts for how a title is won.
 */
export function TitleCard({ board }: { board: StatBoardResult }) {
  const [expanded, setExpanded] = useState(false);
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
              <Avatar name={holder.gameName} size="md" />
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
              <Avatar name={row.gameName} size="sm" />
              <span className={styles.rankedName}>{row.gameName}</span>
              <span className={styles.rankedValue}>{row.formatted}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
