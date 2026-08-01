import Link from 'next/link';
import { Avatar } from './Avatar';
import { PillarBar } from './PillarBar';
import { Sparkline } from './Sparkline';
import { profileIcon } from '@/lib/ddragon';
import { winRate } from '@/lib/format';
import { RankBadge } from './RankBadge';
import type { LeaderboardEntry } from '@/lib/leaderboard';
import styles from './StandingsRow.module.css';

/** Column labels, so no number on the board is unexplained. */
export function StandingsHeader() {
  return (
    <div className={`${styles.row} ${styles.header}`} aria-hidden="true">
      <div>#</div>
      <div />
      <div>Player</div>
      <div className={styles.right}>Gap Score</div>
      <div className={styles.pillarCell}>Score breakdown</div>
      <div className={styles.right}>KDA · win rate</div>
      <div className={styles.right}>Form</div>
    </div>
  );
}

/** The distance to the player above — rendered between rows, not inside them. */
export function GapMarker({ delta }: { delta: number }) {
  return (
    <div className={styles.gapMarker}>
      <div className={styles.gapLine} />
      <div className={styles.gapValue}>
        {Math.abs(delta).toFixed(1)} <span>behind</span>
      </div>
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

/** Nobody below this line has any games to score. */
export function UnratedDivider() {
  return (
    <div className={styles.boundary}>
      <div className={styles.boundaryLine} />
      <div className={styles.boundaryLabel}>No games ingested yet</div>
      <div className={styles.boundaryLine} />
    </div>
  );
}

export function StandingsRow({
  entry,
  version,
}: {
  entry: LeaderboardEntry;
  version: string;
}) {
  const { player, rating, position } = entry;
  const games = rating.wins + rating.losses;

  return (
    <div className={`${styles.row} ${position === 1 ? styles.lead : ''}`}>
      <div className={styles.position}>{position}</div>

      <PlayerAvatar player={player} version={version} />

      <div className={styles.identity}>
        <Link
          className={styles.name}
          href={`/player/${player.platform}/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`}
        >
          {player.gameName}
        </Link>
        <div className={styles.meta}>
          <RankBadge rank={player.rank} />
          {player.nickname ? (
            <span className={styles.nickname}>{player.nickname}</span>
          ) : player.title ? (
            <span
              className={styles.title}
              title={`${player.title.label} — ${player.title.detail}${
                player.titles.length > 1
                  ? `. Also holds ${player.titles.slice(1).map((t) => t.label).join(', ')}.`
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
        {rating.rated ? (
          <>
            <div className={styles.score}>{rating.gapScore.toFixed(1)}</div>
            <div className={styles.scoreSub}>out of 100</div>
          </>
        ) : (
          <>
            <div className={`${styles.score} ${styles.unrated}`}>—</div>
            <div className={styles.scoreSub}>not scored</div>
          </>
        )}
      </div>

      <div className={styles.pillarCell}>
        {rating.rated ? (
          <PillarBar
            rankScore={rating.rankScore}
            performanceScore={rating.performanceScore}
            consistencyScore={rating.consistencyScore}
          />
        ) : (
          <div className={styles.awaiting}>Waiting on the next ingest</div>
        )}
      </div>

      <div className={styles.record}>
        {rating.rated ? (
          <>
            <div className={styles.kda}>
              {player.kda.toFixed(2)} <span>KDA</span>
            </div>
            <div className={styles.recordSub}>
              {winRate(rating.wins, rating.losses)}% of {games} games
            </div>
            <div className={styles.recordSub}>
              {rating.wins}W {rating.losses}L
            </div>
          </>
        ) : (
          <div className={styles.recordSub}>no games yet</div>
        )}
      </div>

      <div className={styles.trend}>
        {rating.rated ? (
          <>
            <Sparkline values={player.form.slice(0, 12)} seed={player.puuid.slice(0, 8)} />
            <div className={styles.trendLabel}>last {Math.min(12, player.form.length)}</div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Discord avatar when somebody has proved they own the account, the League
 * profile icon otherwise, and generated initials only as a last resort.
 */
function PlayerAvatar({
  player,
  version,
}: {
  player: LeaderboardEntry['player'];
  version: string;
}) {
  if (player.ownerImage) {
    return (
      <img
        className={styles.avatar}
        src={player.ownerImage}
        alt=""
        width={36}
        height={36}
        title={`Verified as ${player.ownerName ?? 'a member'}`}
      />
    );
  }

  if (player.profileIconId !== null) {
    return (
      <img
        className={styles.avatar}
        src={profileIcon(version, player.profileIconId)}
        alt=""
        width={36}
        height={36}
      />
    );
  }

  return <Avatar name={player.gameName} />;
}
