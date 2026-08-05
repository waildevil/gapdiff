'use client';

import { useState, useTransition } from 'react';
import { leaveGroupAction } from '@/app/actions/groups';
import styles from './LeaveGroupButton.module.css';

interface Props {
  groupId: number;
  name: string;
}

/**
 * Member-facing off-ramp on the groups dashboard. The founder never sees this
 * — leaveGroupAction rejects them server-side too, but the owner check on the
 * list page keeps the button from even showing, since their real exit is
 * deleting the group.
 */
export function LeaveGroupButton({ groupId, name }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  const [pending, startTransition] = useTransition();

  if (left) return null;

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await leaveGroupAction(groupId);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      setLeft(true);
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
        title={confirming ? `Click again to leave ${name}` : `Leave ${name}`}
      >
        {pending ? '…' : confirming ? 'Confirm leave' : 'Leave'}
      </button>
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}
