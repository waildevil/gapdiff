import styles from './PillarBar.module.css';

interface PillarBarProps {
  rankScore: number | null;
  performanceScore: number;
  consistencyScore: number;
}

/**
 * Shows how the Gap Score was assembled: three tick-marked numbers, not a
 * stacked bar. A bar implies the segments are lengths worth comparing to
 * each other; they're not — they're independent 0-100 scores.
 */
export function PillarBar({ rankScore, performanceScore, consistencyScore }: PillarBarProps) {
  const ranked = rankScore !== null;

  return (
    <div className={styles.pillars}>
      <Stat label="Rnk" value={ranked ? rankScore.toFixed(0) : '—'} muted={!ranked} />
      <Stat label="Prf" value={performanceScore.toFixed(0)} />
      <Stat label="Cns" value={consistencyScore.toFixed(0)} />
    </div>
  );
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={`${styles.statValue} ${muted ? styles.statMuted : ''}`}>{value}</div>
    </div>
  );
}
