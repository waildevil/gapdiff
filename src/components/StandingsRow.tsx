import Link from 'next/link';
import { Avatar } from './Avatar';
import { PillarBar } from './PillarBar';
import { Sparkline } from './Sparkline';
import { tierColor, tierLabel, winRate } from '@/lib/format';
import type { LeaderboardEntry } from '@/lib/leaderboard';
import styles from './StandingsRow.module.css';

/** The distance to the player above — rendered between rows, not inside them. */
export function GapMarker({ delta }: { delta: number }) {
  return (
    <div className={styles.gapMarker} aria-hidden="true">
      <div className={styles.gapLine} />
      <div className={styles.gapValue}>−{Math.abs(delta).toFixed(1)}</div>
    </div>
  );
}

/**
 * Marks where ranked standings end. An unranked score is computed without a
 * rank pillar, so the difference across this line is not a real gap.
 */
export function UnrankedDivider() {
  return (
    <div className={styles.boundary}>
      <div className={styles.boundaryLine} />
      <div className={styles.boundaryLabel}>Unranked · not directly comparable</div>
      <div className={styles.boundaryLine} />
    </div>
  );
}

export function StandingsRow({ entry }: { entry: LeaderboardEntry }) {
  const { player, rating, position } = entry;

  return (
    <div className={`${styles.row} ${position === 1 ? styles.lead : ''}`}>
      <div className={styles.position}>{position}</div>
      <Avatar name={player.gameName} />

      <div className={styles.identity}>
        <Link
          className={styles.name}
          href={`/player/${player.platform}/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`}
        >
          {player.gameName}
        </Link>
        <div className={styles.meta}>
          <span className="tier" style={{ color: tierColor(player.rank?.tier ?? 'UNRANKED') }}>
            {tierLabel(player.rank)}
          </span>
          {/* A manual nickname overrides the earned title. */}
          {player.nickname ? (
            <span className={styles.nickname}>{player.nickname}</span>
          ) : player.title ? (
            <span
              className={styles.title}
              title={`${player.title.label} — ${player.title.detail}${
                player.titles.length > 1
                  ? `. Also holds ${player.titles
                      .slice(1)
                      .map((t) => t.label)
                      .join(', ')}.`
                  : ''
              }`}
            >
              {player.title.label}
              {player.titles.length > 1 ? (
                <span className={styles.titleMore}>+{player.titles.length - 1}</span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.scoreCell}>
        <div className={styles.score}>{rating.gapScore.toFixed(1)}</div>
      </div>

      <div className={styles.pillarCell}>
        <PillarBar
          rankScore={rating.rankScore}
          performanceScore={rating.performanceScore}
          consistencyScore={rating.consistencyScore}
        />
      </div>

      <div className={styles.record}>
        {rating.wins}–{rating.losses}
        <div className={styles.recordSub}>
          {winRate(rating.wins, rating.losses)}% · {rating.games} scored
        </div>
      </div>

      <div className={styles.trend}>
        <Sparkline values={player.form.slice(0, 12)} seed={player.puuid.slice(0, 8)} />
      </div>
    </div>
  );
}
