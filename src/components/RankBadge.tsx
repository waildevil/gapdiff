import { rankEmblem } from '@/lib/ddragon';
import { tierColor, tierLabel, type RankLike } from '@/lib/format';
import styles from './RankBadge.module.css';

interface RankBadgeProps {
  rank: RankLike | null;
  /** 'md' for standalone cards; 'sm' sits inline on a meta line. */
  size?: 'sm' | 'md';
}

/**
 * Crest plus tier text, the standard way to show a rank inline.
 *
 * Community Dragon carries a crest for every tier including unranked, so this
 * never has to choose between an empty slot and a shifted layout.
 */
export function RankBadge({ rank, size = 'sm' }: RankBadgeProps) {
  const tier = rank?.tier ?? 'UNRANKED';

  return (
    <span className={`${styles.wrap} ${size === 'md' ? styles.md : ''}`}>
      <img className={styles.crest} src={rankEmblem(tier)} alt="" />
      <span className={styles.label} style={{ color: tierColor(tier) }}>
        {tierLabel(rank)}
      </span>
    </span>
  );
}
