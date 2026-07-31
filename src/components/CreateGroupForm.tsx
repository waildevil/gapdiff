'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createGroupAction } from '@/app/actions/groups';
import styles from '@/app/groups/groups.module.css';

export function CreateGroupForm({ claimedAccounts }: { claimedAccounts: number }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createGroupAction(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName('');
      router.push(`/groups/${result.slug}/manage`);
    });
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Create a group</div>
        <div className="card-note">
          {claimedAccounts > 0
            ? `${claimedAccounts} of your accounts will be added`
            : 'add a Riot account first to appear on the board'}
        </div>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The Boys"
          maxLength={64}
          autoComplete="off"
        />
        <button className={styles.submit} type="submit" disabled={isPending || !name.trim()}>
          {isPending ? 'Creating…' : 'Create'}
        </button>
      </form>

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
