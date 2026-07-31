import Link from 'next/link';
import type { StatBoardResult } from '@/lib/leaderboard';
import { MIN_GAMES_FOR_TITLE } from '@/lib/titles';
import styles from './StatBoards.module.css';

/**
 * One ranked list per metric, showing the whole group rather than just the
 * holder — the gap to the person above is the part worth arguing about.
 */
export function StatBoards({ boards }: { boards: StatBoardResult[] }) {
  return (
    <div className={styles.grid}>
      {boards.map((board) => (
        <div className="card" key={board.id}>
          <div className={styles.head}>
            <div className={styles.label}>{board.label}</div>
            <div className={styles.metric}>{board.metricLabel}</div>
          </div>

          {board.rows.map((row) => (
            <div
              key={row.puuid}
              className={`${styles.row} ${row.holdsTitle ? styles.leader : ''}`}
            >
              <div className={styles.pos}>{row.position}</div>

              <div className={styles.who}>
                <Link
                  className={styles.name}
                  href={`/player/${row.platform}/${encodeURIComponent(row.gameName)}/${encodeURIComponent(row.tagLine)}`}
                >
                  {row.gameName}
                </Link>
                {/* Games count always shows — the title line is extra, not a
                    replacement, otherwise the holder's sample size is hidden. */}
                <span className={`${styles.games} ${row.eligible ? '' : styles.ineligible}`}>
                  {row.games} {row.games === 1 ? 'game' : 'games'}
                  {row.eligible ? '' : ` · needs ${MIN_GAMES_FOR_TITLE}`}
                </span>
                {row.holdsTitle ? (
                  <span className={styles.crown}>
                    {row.takenFrom ? `took it from ${row.takenFrom}` : 'holds the title'}
                  </span>
                ) : null}
              </div>

              <div className={styles.value}>{row.games === 0 ? '—' : row.formatted}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
