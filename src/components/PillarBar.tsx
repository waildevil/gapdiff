import styles from './PillarBar.module.css';

interface PillarBarProps {
  rankScore: number | null;
  performanceScore: number;
  consistencyScore: number;
}

/**
 * Shows how the Gap Score was assembled. Each segment is a pillar's weighted
 * contribution, so the bar's total length *is* the score.
 *
 * Unranked players have the rank weight redistributed across the two pillars
 * that can still be measured — same split the rating engine uses.
 */
export function PillarBar({ rankScore, performanceScore, consistencyScore }: PillarBarProps) {
  const ranked = rankScore !== null;

  const segments = ranked
    ? [
        { key: 'rank', className: styles.rank, width: rankScore * 0.4 },
        { key: 'perf', className: styles.perf, width: performanceScore * 0.4 },
        { key: 'cons', className: styles.cons, width: consistencyScore * 0.2 },
      ]
    : [
        { key: 'perf', className: styles.perf, width: performanceScore * 0.65 },
        { key: 'cons', className: styles.cons, width: consistencyScore * 0.35 },
      ];

  return (
    <div className={styles.pillars}>
      <div className={styles.bar}>
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={`${styles.seg} ${segment.className}`}
            style={{ width: `${segment.width}%` }}
          />
        ))}
      </div>
      <div className={styles.key}>
        <span>{ranked ? `RNK ${rankScore.toFixed(0)}` : 'UNRANKED'}</span>
        <span>PRF {performanceScore.toFixed(0)}</span>
        <span>CNS {consistencyScore.toFixed(0)}</span>
      </div>
    </div>
  );
}
