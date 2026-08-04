'use client';

import { useState } from 'react';
import styles from './CopyDuelLink.module.css';

/** Copies the duel's shareable link — the whole point is sending it outside the group. */
export function CopyDuelLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/duels/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked in some contexts; nothing more to do here.
    }
  }

  return (
    <button className={styles.button} onClick={copy}>
      {copied ? 'Copied' : 'Copy duel link'}
    </button>
  );
}
