import type { LeaderboardPlayer } from '@/lib/leaderboard';
import { profileIcon } from '@/lib/ddragon';
import { Avatar } from './Avatar';
import styles from './AwardsBoard.module.css';

/** Discord avatar when verified, League profile icon otherwise, initials as a last resort. */
export function PlayerAvatar({
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
