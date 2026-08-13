import Link from 'next/link';
import type { DuoBond, LeaderboardPlayer, StatBoardResult } from '@/lib/leaderboard';
import { profileIcon } from '@/lib/ddragon';
import { Avatar } from './Avatar';
import { RankBadge } from './RankBadge';
import { TitleCard } from './TitleCard';
import styles from './AwardsBoard.module.css';

function profileHref(player: { platform: string; gameName: string; tagLine: string }) {
  return `/player/${player.platform}/${encodeURIComponent(player.gameName)}/${encodeURIComponent(player.tagLine)}`;
}

/** Discord avatar when verified, League profile icon otherwise, initials as a last resort. */
function PlayerAvatar({
  player,
  version,
  size = 'md',
}: {
  player: Pick<LeaderboardPlayer, 'gameName' | 'ownerImage' | 'profileIconId'>;
  version: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const px = size === 'lg' ? 54 : size === 'sm' ? 28 : 36;

  if (player.ownerImage) {
    return (
      <img className={styles.avatarImg} src={player.ownerImage} alt="" width={px} height={px} />
    );
  }
  if (player.profileIconId !== null) {
    return (
      <img
        className={styles.avatarImg}
        src={profileIcon(version, player.profileIconId)}
        alt=""
        width={px}
        height={px}
      />
    );
  }
  return <Avatar name={player.gameName} size={size} />;
}

function DuoBondCard({
  duoBond,
  players,
  version,
}: {
  duoBond: DuoBond;
  players: LeaderboardPlayer[];
  version: string;
}) {
  const a = players.find((p) => p.puuid === duoBond.aPuuid);
  const b = players.find((p) => p.puuid === duoBond.bPuuid);
  if (!a || !b) return null;

  return (
    <div className={`card ${styles.titleCard}`}>
      <div className={styles.titleCardHead}>
        <span className={styles.titleLabel}>Duo Bond</span>
        <span className={styles.titleMetric}>win rate queued together</span>
      </div>

      <div className={styles.duoPair}>
        <Link href={profileHref(a)} className={styles.duoPlayer}>
          <PlayerAvatar player={a} version={version} />
          <span className={styles.titleHolderName}>{a.gameName}</span>
        </Link>
        <span className={styles.duoPlus}>+</span>
        <Link href={profileHref(b)} className={styles.duoPlayer}>
          <PlayerAvatar player={b} version={version} />
          <span className={styles.titleHolderName}>{b.gameName}</span>
        </Link>
      </div>
      <div className={styles.titleHolderValue}>
        {Math.round(duoBond.winRate * 100)}% over {duoBond.games} games together
      </div>
    </div>
  );
}

/**
 * One clickable card per title, plus Duo Bond, plus a full roster below —
 * every group member shows up somewhere, not just whoever's currently
 * leading a board. See src/lib/titles.ts for how a title is won.
 */
export function AwardsBoard({
  boards,
  duoBond,
  players,
  version,
}: {
  boards: StatBoardResult[];
  duoBond: DuoBond | null;
  players: LeaderboardPlayer[];
  version: string;
}) {
  return (
    <div>
      <div className={styles.grid}>
        {boards.map((board) => (
          <TitleCard key={board.id} board={board} />
        ))}
        {duoBond ? <DuoBondCard duoBond={duoBond} players={players} version={version} /> : null}
      </div>

      <div className={styles.rosterHead}>
        <span className={styles.rosterLabel}>Everyone this week</span>
        <span className="card-note">{players.length} tracked</span>
      </div>
      <div className={styles.rosterGrid}>
        {players.map((player) => (
          <Link key={player.puuid} href={profileHref(player)} className={`card ${styles.rosterCard}`}>
            <PlayerAvatar player={player} version={version} size="lg" />
            <div className={styles.rosterInfo}>
              <span className={styles.rosterName}>{player.gameName}</span>
              <RankBadge rank={player.rank} />
              {player.nickname ? (
                <span className={styles.rosterNickname}>{player.nickname}</span>
              ) : player.title ? (
                <span className={styles.rosterTitle}>{player.title.label}</span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
