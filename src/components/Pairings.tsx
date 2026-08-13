import { Fragment } from 'react';
import Link from 'next/link';
import type { LeaderboardPlayer, PairRecord } from '@/lib/leaderboard';
import { winRate } from '@/lib/format';
import styles from './Pairings.module.css';

interface PairingsProps {
  pairs: PairRecord[];
  /** Every member on the board, for resolving puuids to names. */
  players: LeaderboardPlayer[];
  periodLabel: string;
}

/**
 * Who queues with whom, and how it goes.
 *
 * The public sites can't show this — it needs to know who your friends are —
 * which makes it the one board nobody can check elsewhere when they disagree
 * with it. Rivalry rows only appear when the draw actually put two members on
 * opposite sides, which in a group that queues together is rare.
 */
export function Pairings({ pairs, players, periodLabel }: PairingsProps) {
  const byPuuid = new Map(players.map((p) => [p.puuid, p]));
  const pairByKey = new Map(pairs.map((p) => [`${p.aPuuid}|${p.bPuuid}`, p]));

  // Only members who show up in at least one pair get a row/column — an idle
  // member would otherwise draw a matrix full of empty cells.
  const activePuuids = new Set<string>();
  for (const pair of pairs) {
    if (pair.togetherGames === 0) continue;
    activePuuids.add(pair.aPuuid);
    activePuuids.add(pair.bPuuid);
  }
  const roster = players.filter((p) => activePuuids.has(p.puuid));

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Duos</div>
        <div className="card-note">Games in the same lobby · {periodLabel}</div>
      </div>

      {roster.length === 0 ? (
        <div className={styles.empty}>
          Nobody has shared a lobby this period. Two members only land in one
          game by queueing together, so this fills up as soon as anybody duos.
        </div>
      ) : (
        <div className={styles.matrixWrap}>
          <div
            className={styles.matrix}
            style={{ gridTemplateColumns: `minmax(90px, auto) repeat(${roster.length}, 46px)` }}
          >
            <div className={styles.corner} />
            {roster.map((p) => (
              <div key={p.puuid} className={styles.colHead} title={p.nickname ?? p.gameName}>
                {(p.nickname ?? p.gameName).slice(0, 4)}
              </div>
            ))}

            {roster.map((rowPlayer) => (
              <Fragment key={rowPlayer.puuid}>
                <div className={styles.rowHead}>
                  <PlayerName player={rowPlayer} />
                </div>
                {roster.map((colPlayer) => {
                  if (colPlayer.puuid === rowPlayer.puuid) {
                    return <div key={colPlayer.puuid} className={styles.selfCell} />;
                  }
                  const pair =
                    pairByKey.get(`${rowPlayer.puuid}|${colPlayer.puuid}`) ??
                    pairByKey.get(`${colPlayer.puuid}|${rowPlayer.puuid}`);

                  if (!pair || pair.togetherGames === 0) {
                    return <div key={colPlayer.puuid} className={styles.emptyCell} />;
                  }

                  const losses = pair.togetherGames - pair.togetherWins;
                  const rate = winRate(pair.togetherWins, losses);

                  return (
                    <div
                      key={colPlayer.puuid}
                      className={styles.cell}
                      style={{ background: cellTint(rate) }}
                      title={`${rowPlayer.nickname ?? rowPlayer.gameName} + ${colPlayer.nickname ?? colPlayer.gameName}: ${pair.togetherWins}W ${losses}L over ${pair.togetherGames} games`}
                    >
                      <span className={styles.cellRate} style={{ color: rateColor(rate) }}>
                        {rate}%
                      </span>
                      <span className={styles.cellGames}>{pair.togetherGames}g</span>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Deliberately wider than the performance ramp: over a handful of shared games
 * a 55% duo is noise, and colouring it would invent a trend.
 */
function rateColor(rate: number): string {
  if (rate >= 60) return 'var(--good)';
  if (rate <= 40) return 'var(--bad)';
  return 'var(--muted)';
}

/** Tints a cell toward good/bad soft, strength scaled by distance from 50%. */
function cellTint(rate: number): string {
  const strength = Math.min(Math.abs(rate - 50) / 50, 1);
  if (strength < 0.08) return 'var(--surface-2)';
  return rate >= 50
    ? `color-mix(in srgb, var(--good-soft) ${Math.round(strength * 100)}%, var(--surface-2))`
    : `color-mix(in srgb, var(--bad-soft) ${Math.round(strength * 100)}%, var(--surface-2))`;
}

function PlayerName({ player }: { player: LeaderboardPlayer }) {
  return (
    <Link
      className={styles.name}
      href={`/player/${player.platform}/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`}
    >
      {player.nickname ?? player.gameName}
    </Link>
  );
}
