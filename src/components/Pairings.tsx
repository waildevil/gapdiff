import Link from 'next/link';
import type { LeaderboardPlayer, PairRecord } from '@/lib/leaderboard';
import { perfColor, winRate } from '@/lib/format';
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

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Duos</div>
        <div className="card-note">Games in the same lobby · {periodLabel}</div>
      </div>

      {pairs.length === 0 ? (
        <div className={styles.empty}>
          Nobody has shared a lobby this period. Two members only land in one
          game by queueing together, so this fills up as soon as anybody duos.
        </div>
      ) : (
        <div>
          {pairs.map((pair) => {
            const a = byPuuid.get(pair.aPuuid);
            const b = byPuuid.get(pair.bPuuid);
            if (!a || !b) return null;

            const losses = pair.togetherGames - pair.togetherWins;
            const rate = winRate(pair.togetherWins, losses);

            return (
              <div key={`${pair.aPuuid}|${pair.bPuuid}`} className={styles.row}>
                <div className={styles.names}>
                  <PlayerName player={a} />
                  <span className={styles.amp}>+</span>
                  <PlayerName player={b} />
                </div>

                <div className={styles.middle}>
                  {pair.togetherGames > 0 ? (
                    <>
                      <div className={styles.record}>
                        <span className={styles.wins}>{pair.togetherWins}W</span>{' '}
                        <span className={styles.losses}>{losses}L</span>
                        <span className={styles.rate} style={{ color: rateColor(rate) }}>
                          {rate}%
                        </span>
                      </div>
                      <div className={styles.bar}>
                        <div
                          className={styles.barWins}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className={styles.record}>
                      <span className={styles.faint}>never queued together</span>
                    </div>
                  )}

                  <div className={styles.foot}>
                    {pair.togetherGames} together
                    {pair.aScore !== null && pair.bScore !== null ? (
                      <>
                        {' · '}
                        <span style={{ color: perfColor(pair.aScore) }}>
                          {pair.aScore.toFixed(0)}
                        </span>
                        {' / '}
                        <span style={{ color: perfColor(pair.bScore) }}>
                          {pair.bScore.toFixed(0)}
                        </span>
                        {' avg'}
                      </>
                    ) : null}
                    {/* Only shown when it has ever happened, so the common case
                        isn't cluttered with a permanent "0 against". */}
                    {pair.againstGames > 0 ? (
                      <>
                        {' · '}
                        <span className={styles.versus}>
                          {pair.againstGames} against, {a.gameName} won{' '}
                          {pair.againstAWins}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
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
