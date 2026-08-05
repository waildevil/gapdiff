'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './PeriodPicker.module.css';

interface PeriodPickerProps {
  slug: string;
  index: number;
  latestIndex: number;
  label: string;
  start: Date;
  end: Date;
  games: number;
  isCurrent: boolean;
  /** Every week on record, most recent first — powers the jump-to dropdown. */
  weeks: { index: number; label: string }[];
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Weeks are addressable by index rather than by date, so a link to week 1
 * keeps meaning the same week forever. The end date shown is inclusive — the
 * window itself is half-open, so a game at exactly the reset instant belongs
 * to the next week.
 */
export function PeriodPicker({
  slug,
  index,
  latestIndex,
  label,
  start,
  end,
  games,
  isCurrent,
  weeks,
}: PeriodPickerProps) {
  const router = useRouter();
  const inclusiveEnd = new Date(end.getTime() - 1);
  const hasPrevious = index > 0;
  const hasNext = index < latestIndex;

  return (
    <div className={styles.picker}>
      <div className={styles.range}>
        <span className={styles.dates}>{label}</span>
        <span className={`${styles.meta} ${isCurrent ? styles.current : ''}`}>
          {formatDay(start)} → {formatDay(inclusiveEnd)}
          {isCurrent ? ' · in progress' : ''} · {games} {games === 1 ? 'game' : 'games'}
        </span>
      </div>

      <div className={styles.nav}>
        {weeks.length > 1 ? (
          <select
            className={styles.select}
            aria-label="Jump to week"
            value={index}
            onChange={(e) => router.push(`/group/${slug}?week=${e.target.value}`)}
          >
            {weeks.map((w) => (
              <option key={w.index} value={w.index}>
                {w.label}
              </option>
            ))}
          </select>
        ) : null}
        <Link
          className={`${styles.button} ${hasPrevious ? '' : styles.disabled}`}
          href={`/group/${slug}?week=${index - 1}`}
          aria-disabled={!hasPrevious}
          tabIndex={hasPrevious ? undefined : -1}
        >
          ← Previous
        </Link>
        <Link
          className={`${styles.button} ${hasNext ? '' : styles.disabled}`}
          href={`/group/${slug}?week=${index + 1}`}
          aria-disabled={!hasNext}
          tabIndex={hasNext ? undefined : -1}
        >
          Next →
        </Link>
        {!isCurrent ? (
          <Link className={styles.button} href={`/group/${slug}`}>
            This week
          </Link>
        ) : null}
      </div>
    </div>
  );
}
