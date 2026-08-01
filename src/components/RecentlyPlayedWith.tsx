import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { profileIcon } from '@/lib/ddragon';
import { MIN_GAMES_TOGETHER, type Teammate } from '@/lib/teammates';
import type { Platform } from '@/lib/riot/routing';
import styles from './RecentlyPlayedWith.module.css';

interface RecentlyPlayedWithProps {
  teammates: Teammate[];
  platform: Platform;
  /** Size of the window the tally was taken over, for the caption. */
  games: number;
  /** Data Dragon version, for the icon URLs. */
  version: string;
}

/**
 * The duo-partner panel. Laid out as an auto-filling grid so the same component
 * reads as a wide strip in the single-column profile and as a plain list once
 * it moves into a sidebar.
 */
export function RecentlyPlayedWith({
  teammates,
  platform,
  games,
  version,
}: RecentlyPlayedWithProps) {
  return (
    <div className="card">
      <div className={styles.head}>
        <div className={styles.label}>Recently played with</div>
        <div className={styles.caption}>
          Same team, {MIN_GAMES_TOGETHER}+ times in the last {games} games
        </div>
      </div>

      {teammates.length === 0 ? (
        <div className={styles.empty}>
          Nobody turned up twice — every game here was with a different squad.
        </div>
      ) : (
        <div className={styles.grid}>
          {teammates.map((mate) => (
            <Link
              key={mate.puuid}
              className={styles.row}
              href={`/player/${platform}/${encodeURIComponent(mate.gameName)}/${encodeURIComponent(mate.tagLine)}`}
            >
              {/* Riot omits the icon on some older matches; the generated
                  avatar keeps the row from collapsing when it does. */}
              {mate.profileIconId > 0 ? (
                <img
                  className={styles.icon}
                  src={profileIcon(version, mate.profileIconId)}
                  alt=""
                  width={28}
                  height={28}
                  loading="lazy"
                />
              ) : (
                <Avatar name={mate.gameName} size="sm" />
              )}

              <div className={styles.who}>
                <div className={styles.name}>{mate.gameName}</div>
                <div className={styles.games}>
                  {mate.games} together ·{' '}
                  <span className={styles.wins}>{mate.wins}W</span>{' '}
                  <span className={styles.losses}>{mate.losses}L</span>
                </div>
              </div>

              <div className={styles.rate} style={{ color: rateColor(mate.winRate) }}>
                {mate.winRate}%
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Deliberately wider than the performance ramp: over two or three shared games
 * a 55% pairing is noise, and colouring it would invent a trend.
 */
function rateColor(rate: number): string {
  if (rate >= 60) return 'var(--good)';
  if (rate <= 40) return 'var(--bad)';
  return 'var(--muted)';
}
