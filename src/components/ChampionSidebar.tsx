'use client';

import { useMemo } from 'react';
import { championIcon } from '@/lib/ddragon';
import { summariseChampions } from '@/lib/champions';
import { perfColor } from '@/lib/format';
import type { ProfileMatch } from '@/lib/profile';
import styles from './ChampionSidebar.module.css';

interface ChampionSidebarProps {
  matches: ProfileMatch[];
  version: string;
}

/**
 * Left sidebar showing champion pool with icons and stats.
 * Compact vertical list, updates with queue filtering.
 */
export function ChampionSidebar({ matches, version }: ChampionSidebarProps) {
  const champs = useMemo(() => summariseChampions(matches), [matches]);

  if (champs.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.label}>Champions</div>
        <div className={styles.hint}>No games in this queue</div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>Champions</div>
      <div className={styles.list}>
        {champs.map((champ) => (
          <div key={champ.championName} className={styles.row}>
            <img
              className={styles.icon}
              src={championIcon(version, champ.championName)}
              alt={champ.championName}
              title={`${champ.championName}: ${champ.winRate}% WR over ${champ.games} games`}
            />
            <div className={styles.info}>
              <div className={styles.name}>{champ.championName}</div>
              <div className={styles.stats}>
                <span className={champ.wins >= champ.losses ? styles.good : styles.bad}>
                  {champ.winRate}%
                </span>
                <span className={styles.dot}>·</span>
                <span>{champ.games}</span>
              </div>
            </div>
            {champ.avgGapScore !== null ? (
              <div
                className={styles.score}
                style={{ color: perfColor(champ.avgGapScore) }}
                title={`Average gap score: ${champ.avgGapScore.toFixed(0)}`}
              >
                {champ.avgGapScore.toFixed(0)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
