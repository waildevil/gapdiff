'use client';

import { useState, useTransition } from 'react';
import { claimAccount, forgetAccount, verifyAccount } from '@/app/actions/accounts';
import { profileIcon } from '@/lib/ddragon';
import { PLATFORMS, PLATFORM_LABELS, type Platform } from '@/lib/riot/routing';
import type { ClaimedAccount } from '@/lib/verification';
import styles from './AccountManager.module.css';

interface Props {
  accounts: ClaimedAccount[];
  version: string;
}

export function AccountManager({ accounts, version }: Props) {
  const [riotId, setRiotId] = useState('');
  const [platform, setPlatform] = useState<Platform>('euw1');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = riotId.trim();
    if (trimmed.lastIndexOf('#') <= 0) {
      setError('Riot IDs look like Name#TAG — include the tag after the #.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await claimAccount(trimmed, platform);
      if (!result.ok) setError(result.error);
      else setRiotId('');
    });
  }

  return (
    <div className={styles.stack}>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Add a Riot account</div>
          <div className="card-note">you&apos;ll prove it&apos;s yours next</div>
        </div>

        <form className={styles.form} onSubmit={handleAdd}>
          <select
            className={styles.select}
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            aria-label="Region"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
          <input
            className={styles.input}
            value={riotId}
            onChange={(e) => setRiotId(e.target.value)}
            placeholder="Name#TAG"
            spellCheck={false}
            autoComplete="off"
          />
          <button className={styles.submit} type="submit" disabled={isPending || !riotId.trim()}>
            {isPending ? 'Checking…' : 'Add'}
          </button>
        </form>

        {error ? <p className={styles.error}>{error}</p> : null}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Your accounts</div>
          <div className="card-note">
            {accounts.length} claimed · {accounts.filter((a) => a.verifiedAt).length} verified
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className={styles.empty}>No accounts yet. Add one above.</div>
        ) : (
          accounts.map((account) => (
            <AccountRow key={account.puuid} account={account} version={version} />
          ))
        )}
      </div>
    </div>
  );
}

function AccountRow({ account, version }: { account: ClaimedAccount; version: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [good, setGood] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleVerify() {
    setStatus(null);
    startTransition(async () => {
      const result = await verifyAccount(account.puuid);
      switch (result.status) {
        case 'verified':
          setGood(true);
          setStatus('Verified.');
          break;
        case 'mismatch':
          setGood(false);
          setStatus(
            `Still showing icon ${result.actual ?? '?'}. Riot can take up to a minute to catch up — change it, wait, then try again.`,
          );
          break;
        case 'expired':
          setGood(false);
          setStatus('That challenge expired. Add the account again for a fresh one.');
          break;
        case 'none':
          setGood(false);
          setStatus('No challenge outstanding. Add the account again.');
          break;
        default:
          setGood(false);
          setStatus(result.error);
      }
    });
  }

  return (
    <div className={styles.row}>
      <img
        className={styles.icon}
        src={profileIcon(version, account.profileIconId ?? 0)}
        alt=""
        width={44}
        height={44}
      />

      <div className={styles.who}>
        <div className={styles.name}>
          {account.gameName}
          <span>#{account.tagLine}</span>
        </div>
        <div className={styles.meta}>
          {account.platform.toUpperCase()}
          {account.summonerLevel ? ` · Level ${account.summonerLevel}` : ''}
        </div>
      </div>

      <span className={`${styles.badge} ${account.verifiedAt ? styles.verified : styles.unverified}`}>
        {account.verifiedAt ? 'Verified' : 'Unverified'}
      </span>

      <form action={() => forgetAccount(account.puuid)}>
        <button className={styles.link} type="submit">
          Remove
        </button>
      </form>

      {!account.verifiedAt && account.pendingIconId !== null ? (
        <div className={styles.challenge}>
          <img
            className={styles.target}
            src={profileIcon(version, account.pendingIconId)}
            alt={`Profile icon ${account.pendingIconId}`}
            width={72}
            height={72}
          />
          <div className={styles.instructions}>
            <p className={styles.step}>
              Open League, go to your profile, and set your icon to <strong>this one</strong>.
              Then come back and hit Verify.
            </p>
            <p className={styles.stepNote}>
              Icon #{account.pendingIconId} · expires{' '}
              {account.pendingExpiresAt
                ? account.pendingExpiresAt.toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'soon'}{' '}
              · you can change it back afterwards
            </p>

            <div className={styles.verifyRow}>
              <button className={styles.verify} onClick={handleVerify} disabled={isPending}>
                {isPending ? 'Checking…' : 'Verify'}
              </button>
              {status ? (
                <span className={`${styles.status} ${good ? styles.statusGood : styles.statusBad}`}>
                  {status}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
