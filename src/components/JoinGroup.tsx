'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { joinGroupAction } from '@/app/actions/groups';
import styles from '@/app/groups/groups.module.css';

interface Props {
  code: string;
  groupName: string;
  claimedAccounts: number;
  verifiedAccounts: number;
}

export function JoinGroup({ code, groupName, claimedAccounts, verifiedAccounts }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      const result = await joinGroupAction(code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/group/${result.slug}`);
    });
  }

  return (
    <>
      {claimedAccounts === 0 ? (
        <div className="note" style={{ marginTop: 0, marginBottom: 16 }}>
          <b>You haven&apos;t added a Riot account yet.</b> You can join {groupName} now,
          but you won&apos;t show up on the board until you{' '}
          <Link href="/accounts" style={{ color: 'var(--amber)' }}>
            add one
          </Link>
          .
        </div>
      ) : (
        <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 16px' }}>
          {claimedAccounts} of your {claimedAccounts === 1 ? 'account' : 'accounts'} will be
          added to the board
          {verifiedAccounts < claimedAccounts
            ? ` (${claimedAccounts - verifiedAccounts} still unverified)`
            : ''}
          .
        </p>
      )}

      <button className={styles.submit} onClick={handleJoin} disabled={isPending} style={{ padding: '11px 20px' }}>
        {isPending ? 'Joining…' : `Join ${groupName}`}
      </button>

      {error ? <p className={styles.error} style={{ padding: '12px 0 0' }}>{error}</p> : null}
    </>
  );
}
