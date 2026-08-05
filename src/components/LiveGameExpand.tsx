'use client';

import { useState } from 'react';
import { winRate } from '@/lib/format';
import styles from './LiveGameExpand.module.css';

export interface RecentGameRow {
  championIconSrc: string | undefined;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  queueLabel: string;
}

export interface LiveGameExpandProps {
  championIconSrc: string | undefined;
  championName: string;
  onChampion: { games: number; wins: number; kills: number; deaths: number; assists: number } | null;
  season: { games: number; wins: number } | null;
  recentGames: RecentGameRow[];
}

/**
 * Collapsed by default so a full lobby of ten cards doesn't turn into a wall
 * of text — click to reveal what gapdiff already knows about this player:
 * their record on the champion they're playing right now, their season
 * total, and their last five games. All from matches already ingested, none
 * of it a fresh Riot call, so opening every card in a lobby costs nothing.
 */
export function LiveGameExpand({
  championIconSrc,
  championName,
  onChampion,
  season,
  recentGames,
}: LiveGameExpandProps) {
  const [open, setOpen] = useState(false);

  if (!onChampion && !season && recentGames.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Hide history' : 'Show history'}
        <svg
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          viewBox="0 0 16 16"
          width="11"
          height="11"
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
        <div className={styles.panel}>
          {onChampion ? (
            <div className={styles.champRow}>
              {championIconSrc ? (
                <img className={styles.champIcon} src={championIconSrc} alt="" width={26} height={26} />
              ) : (
                <span className={styles.champIcon} />
              )}
              <div className={styles.champText}>
                <div className={styles.champTitle}>
                  {winRate(onChampion.wins, onChampion.games - onChampion.wins)}% win on{' '}
                  {championName} ({onChampion.games} played)
                </div>
                <div className={styles.champKda}>
                  {(onChampion.kills / onChampion.games).toFixed(1)} /{' '}
                  {(onChampion.deaths / onChampion.games).toFixed(1)} /{' '}
                  {(onChampion.assists / onChampion.games).toFixed(1)} avg KDA
                </div>
              </div>
            </div>
          ) : null}

          {season ? (
            <div className={styles.seasonRow}>
              Season: {winRate(season.wins, season.games - season.wins)}% win rate ·{' '}
              {season.games} {season.games === 1 ? 'game' : 'games'}
            </div>
          ) : null}

          {recentGames.length > 0 ? (
            <div className={styles.recent}>
              {recentGames.map((g, i) => (
                <div key={i} className={`${styles.recentRow} ${g.win ? styles.win : styles.loss}`}>
                  {g.championIconSrc ? (
                    <img className={styles.recentIcon} src={g.championIconSrc} alt="" width={20} height={20} />
                  ) : (
                    <span className={styles.recentIcon} />
                  )}
                  <span className={styles.recentResult}>{g.win ? 'W' : 'L'}</span>
                  <span className={styles.recentKda}>
                    {g.kills}/{g.deaths}/{g.assists}
                  </span>
                  <span className={styles.recentQueue}>{g.queueLabel}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
