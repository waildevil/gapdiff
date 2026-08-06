'use client';

import { useState, useTransition } from 'react';
import { removeMemberAction } from '@/app/actions/groups';
import styles from './RemoveMemberButton.module.css';

interface Props {
  groupId: number;
  slug: string;
  userId: string;
  name: string;
}

/**
 * Owner-only control on the manage page. Two clicks, not a typed confirm like
 * deleting the whole group — this is reversible (a new invite brings them
 * right back) and only affects one person, so that much friction would be
 * out of proportion.
 */
export function RemoveMemberButton({ groupId, slug, userId, name }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (removed) return null;

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await removeMemberAction(groupId, slug, userId);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      setRemoved(true);
    });
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.button} ${confirming ? styles.confirming : ''}`}
        onClick={handleClick}
        onBlur={() => setConfirming(false)}
        disabled={pending}
        title={confirming ? `Click again to remove ${name}` : `Remove ${name} from this group`}
      >
        {pending ? '…' : confirming ? 'Confirm remove' : 'Remove'}
      </button>
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}
