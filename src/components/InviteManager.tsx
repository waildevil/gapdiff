'use client';

import { useState, useTransition } from 'react';
import { createInviteAction, revokeInviteAction } from '@/app/actions/groups';
import type { InviteView } from '@/lib/groups';
import styles from './InviteManager.module.css';

interface Props {
  groupId: number;
  slug: string;
  invites: InviteView[];
}

export function InviteManager({ groupId, slug, invites }: Props) {
  const [expiry, setExpiry] = useState('7');
  const [uses, setUses] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createInviteAction(
        groupId,
        slug,
        expiry === 'never' ? null : Number(expiry),
        uses === '' ? null : Number(uses),
      );
      if (!result.ok) setError(result.error);
    });
  }

  async function copy(code: string) {
    const url = `${window.location.origin}/join/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(code);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard is blocked in some contexts; the link is visible to select.
      setError('Could not copy — select the link and copy it manually.');
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Invite links</div>
        <div className="card-note">share in your Discord</div>
      </div>

      <div className={styles.controls}>
        <select
          className={styles.select}
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          aria-label="Expires after"
        >
          <option value="1">Expires in 1 day</option>
          <option value="7">Expires in 7 days</option>
          <option value="30">Expires in 30 days</option>
          <option value="never">Never expires</option>
        </select>

        <select
          className={styles.select}
          value={uses}
          onChange={(e) => setUses(e.target.value)}
          aria-label="Maximum uses"
        >
          <option value="">Unlimited uses</option>
          <option value="1">One use</option>
          <option value="5">Up to 5 uses</option>
          <option value="10">Up to 10 uses</option>
        </select>

        <button className={styles.create} onClick={handleCreate} disabled={isPending}>
          {isPending ? 'Creating…' : 'New invite'}
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {invites.length === 0 ? (
        <div className={styles.empty}>No invites yet. Create one to add your friends.</div>
      ) : (
        invites.map((invite) => (
          <div className={styles.row} key={invite.code}>
            <div className={styles.link}>/join/{invite.code}</div>

            <span className={styles.meta}>
              {invite.uses} used
              {invite.maxUses !== null ? ` / ${invite.maxUses}` : ''}
              {invite.expiresAt
                ? ` · until ${invite.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                : ' · no expiry'}
            </span>

            <button
              className={`${styles.button} ${copied === invite.code ? styles.copied : ''}`}
              onClick={() => copy(invite.code)}
            >
              {copied === invite.code ? 'Copied' : 'Copy link'}
            </button>
            <form action={() => revokeInviteAction(invite.code, slug)}>
              <button className={`${styles.button} ${styles.danger}`} type="submit">
                Revoke
              </button>
            </form>
          </div>
        ))
      )}
    </div>
  );
}
