'use client';

import { useMemo } from 'react';
import { summariseChampions, type ChampionStats } from '@/lib/champions';
import { perfColor } from '@/lib/format';
import type { ProfileMatch } from '@/lib/profile';
import styles from './ChampionStats.module.css';

interface ChampionStatsProps {
  matches: ProfileMatch[];
}

/**
 * Champions ranked by frequency, with per-champ breakdown. Scales with
 * queue filtering — when you switch tabs, this updates to match.
 */
export function ChampionStats({ matches }: ChampionStatsProps) {
  const champs = useMemo(() => summariseChampions(matches), [matches]);

  if (champs.length === 0) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">Champion stats</div>
        </div>
        <div className={styles.empty}>No games in this queue.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Champion stats</div>
        <div className="card-note">{champs.length} champions</div>
      </div>

      <div className={styles.table}>
        <div className={styles.header}>
          <div className={styles.rank}>#</div>
          <div className={styles.champ}>Champion</div>
          <div className={styles.games}>Games</div>
          <div className={styles.wr}>WR</div>
          <div className={styles.kda}>KDA</div>
          <div className={styles.cs}>CS/min</div>
          <div className={styles.vision}>Vision</div>
          <div className={styles.score}>Avg Gap</div>
        </div>

        {champs.map((champ, i) => (
          <div key={champ.championName} className={styles.row}>
            <div className={styles.rank}>{i + 1}</div>
            <div className={styles.champ}>{champ.championName}</div>
            <div className={styles.games}>{champ.games}</div>
            <div className={styles.wr}>
              <span className={champ.wins >= champ.losses ? styles.good : styles.bad}>
                {champ.winRate}%
              </span>
            </div>
            <div className={styles.kda}>{champ.kda.toFixed(2)}</div>
            <div className={styles.cs}>{champ.csPerMin.toFixed(1)}</div>
            <div className={styles.vision}>{champ.visionScore.toFixed(0)}</div>
            <div
              className={styles.score}
              style={{
                color: champ.avgGapScore !== null ? perfColor(champ.avgGapScore) : 'var(--faint)',
              }}
            >
              {champ.avgGapScore !== null ? champ.avgGapScore.toFixed(0) : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
