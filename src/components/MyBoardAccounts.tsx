'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setAccountOnBoard } from '@/app/actions/groups';
import type { BoardAccount } from '@/lib/groups';
import styles from './MyBoardAccounts.module.css';

interface Props {
  groupId: number;
  slug: string;
  accounts: BoardAccount[];
}

/**
 * Lets a member choose which of their own accounts appear on this board.
 *
 * Smurfs are the normal case, so "all of them" is a bad default to force — and
 * without this, an account claimed *after* joining could never get on at all.
 */
export function MyBoardAccounts({ groupId, slug, accounts }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingPuuid, setPendingPuuid] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(puuid: string, onBoard: boolean) {
    setError(null);
    setPendingPuuid(puuid);
    startTransition(async () => {
      const result = await setAccountOnBoard(groupId, slug, puuid, !onBoard);
      setPendingPuuid(null);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="card section-gap">
      <div className="card-head">
        <div className="card-title">Your accounts on this board</div>
        <div className="card-note">
          {accounts.filter((a) => a.onBoard).length} of {accounts.length} showing
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className={styles.empty}>
          You haven&apos;t claimed any Riot accounts yet, so nothing of yours is on the
          board.{' '}
          <Link href="/accounts">Add one</Link> and it&apos;ll appear here.
        </div>
      ) : (
        accounts.map((account) => (
          <div className={styles.row} key={account.puuid}>
            <div className={styles.who}>
              <div className={styles.name}>
                {account.gameName}
                <span>#{account.tagLine}</span>
              </div>
              <div className={styles.meta}>{account.platform.toUpperCase()}</div>
            </div>

            <span
              className={`${styles.badge} ${account.verified ? styles.verified : styles.unverified}`}
            >
              {account.verified ? 'Verified' : 'Unverified'}
            </span>

            <button
              className={`${styles.toggle} ${account.onBoard ? styles.remove : styles.add}`}
              onClick={() => toggle(account.puuid, account.onBoard)}
              disabled={isPending && pendingPuuid === account.puuid}
            >
              {isPending && pendingPuuid === account.puuid
                ? '…'
                : account.onBoard
                  ? 'Remove from board'
                  : 'Add to board'}
            </button>
          </div>
        ))
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
