'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { StatBoardResult } from '@/lib/leaderboard';
import { MIN_GAMES_FOR_TITLE } from '@/lib/titles';
import styles from './Titles.module.css';

/**
 * One row per title, holder-only — not a full ranking board each. As more
 * titles get added this still fits on one screen; a grid of full boards
 * would not. The full ranking is one click away, not always on screen.
 */
export function Titles({ boards }: { boards: StatBoardResult[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Titles</div>
        <div className="card-note">{boards.length} contested</div>
      </div>

      {boards.map((board) => {
        const holder = board.rows.find((row) => row.holdsTitle);
        const open = openId === board.id;

        return (
          <div key={board.id} className={styles.entry}>
            <button
              type="button"
              className={styles.trophyRow}
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : board.id)}
            >
              <div className={styles.info}>
                <div className={styles.label}>{board.label}</div>
                <div className={styles.metric}>{board.metricLabel}</div>
              </div>

              {holder ? (
                <div className={styles.holder}>
                  <span className={styles.holderName}>{holder.gameName}</span>
                  <span className={styles.holderValue}>{holder.formatted}</span>
                </div>
              ) : (
                <span className={styles.unclaimed}>unclaimed</span>
              )}

              <svg
                className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
                viewBox="0 0 16 16"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path
                  d="M4 6l4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {open ? (
              <div className={styles.ranking}>
                {board.rows.map((row) => (
                  <div
                    key={row.puuid}
                    className={`${styles.rankRow} ${row.holdsTitle ? styles.leader : ''}`}
                  >
                    <span className={styles.rankPos}>{row.position}</span>
                    <Link
                      className={styles.rankName}
                      href={`/player/${row.platform}/${encodeURIComponent(row.gameName)}/${encodeURIComponent(row.tagLine)}`}
                    >
                      {row.gameName}
                    </Link>
                    <span className={styles.rankMeta}>
                      <span className={`${styles.rankGames} ${row.eligible ? '' : styles.ineligible}`}>
                        {row.games} {row.games === 1 ? 'game' : 'games'}
                        {row.eligible ? '' : ` · needs ${MIN_GAMES_FOR_TITLE}`}
                      </span>
                      {row.holdsTitle && row.takenFrom ? (
                        <span className={styles.crown}>from {row.takenFrom}</span>
                      ) : null}
                    </span>
                    <span className={styles.rankValue}>{row.games === 0 ? '—' : row.formatted}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
