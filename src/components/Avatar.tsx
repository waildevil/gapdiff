import { hueOf, initials } from '@/lib/format';
import styles from './Avatar.module.css';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Generated placeholder art. Once Data Dragon is wired in, champion avatars
 * swap to <Image src={ddragonChampionIcon(name)} /> and this stays only for
 * players, who have profile icons of their own.
 */
export function Avatar({ name, size = 'md' }: AvatarProps) {
  const hue = hueOf(name);
  const background = `linear-gradient(145deg, hsl(${hue} 62% 62%), hsl(${(hue + 38) % 360} 58% 44%))`;
  const sizeClass = size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : '';

  return (
    <div className={`${styles.avatar} ${sizeClass}`} style={{ background }} title={name}>
      {initials(name)}
    </div>
  );
}
