'use client';

import { useId } from 'react';
import styles from './Logo.module.css';

/**
 * Hex outline (hextech) around a jagged spike — the gap between two
 * players' performance in the same game, the thing the whole site scores.
 */
export function Logo({ size = 26 }: { size?: number }) {
  const glowId = useId();

  return (
    <svg
      className={styles.logo}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        className={styles.hex}
        d="M29 16 22.5 27 9.5 27 3 16 9.5 5 22.5 5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        className={styles.spike}
        d="M8 21 13 11 16.5 17 24 8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
      />
    </svg>
  );
}
