'use client';

import { useState, useTransition } from 'react';
import { setMemberRoleAction } from '@/app/actions/groups';
import styles from './MemberRole.module.css';

interface MemberRoleProps {
  groupId: number;
  slug: string;
  userId: string;
  name: string;
  isFounder: boolean;
  canManage: boolean;
  /** Only a manager sees the controls; everyone sees the badges. */
  viewerCanManage: boolean;
}

/**
 * Who manages the group, and the control to change it.
 *
 * The founder gets a badge and no button — they cannot be demoted by anybody,
 * including themselves, so offering a control that always fails would be worse
 * than offering none.
 */
export function MemberRole({
  groupId,
  slug,
  userId,
  name,
  isFounder,
  canManage,
  viewerCanManage,
}: MemberRoleProps) {
  const [manager, setManager] = useState(canManage);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setMemberRoleAction(groupId, slug, userId, !manager);
        if (!result?.ok) {
          setError(result?.error ?? 'That did not go through.');
          return;
        }
        setManager(!manager);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'That did not go through.');
      }
    });
  }

  return (
    <div className={styles.wrap}>
      {isFounder ? (
        <span className={`${styles.badge} ${styles.founder}`} title="Created this group">
          Owner
        </span>
      ) : manager ? (
        <span className={`${styles.badge} ${styles.manager}`}>Manager</span>
      ) : null}

      {viewerCanManage && !isFounder ? (
        <button
          type="button"
          className={styles.button}
          onClick={toggle}
          disabled={pending}
          title={
            manager
              ? `Remove ${name}'s ability to manage this group`
              : `Let ${name} manage this group`
          }
        >
          {pending ? '…' : manager ? 'Remove manager' : 'Make manager'}
        </button>
      ) : null}

      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}
