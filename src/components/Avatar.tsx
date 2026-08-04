import { initials } from '@/lib/format';
import styles from './Avatar.module.css';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Generated placeholder art. Once Data Dragon is wired in, champion avatars
 * swap to <Image src={ddragonChampionIcon(name)} /> and this stays only for
 * players, who have profile icons of their own.
 *
 * Flat accent, not a per-name hue — a wall of rainbow gradients read as
 * noise against the single-accent palette everywhere else on the site.
 */
export function Avatar({ name, size = 'md' }: AvatarProps) {
  const sizeClass = size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : '';

  return (
    <div className={`${styles.avatar} ${sizeClass}`} title={name}>
      {initials(name)}
    </div>
  );
}
