'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { createDuelAction, searchDuelTargetsAction } from '@/app/actions/duels';
import type { ClaimedAccount } from '@/lib/verification';
import type { DuelTargetCandidate } from '@/lib/duels';
import styles from './ChallengeForm.module.css';

const MAX_TARGETS = 3;
const DEBOUNCE_MS = 200;

interface Props {
  myAccounts: ClaimedAccount[];
}

/** Pick your own account, search for people to challenge, send it. */
export function ChallengeForm({ myAccounts }: Props) {
  const router = useRouter();
  const [myPuuid, setMyPuuid] = useState(myAccounts[0]?.puuid ?? '');
  const [targets, setTargets] = useState<DuelTargetCandidate[]>([]);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<DuelTargetCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  // Loads the default "people from your groups" list on mount, then refilters
  // as soon as there's something typed.
  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const result = await searchDuelTargetsAction(query);
      if (id !== requestId.current) return;
      const pickedPuuids = new Set(targets.map((t) => t.puuid));
      setSuggestions(result.filter((r) => !pickedPuuids.has(r.puuid)));
    }, query ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, targets]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function addTarget(candidate: DuelTargetCandidate) {
    if (targets.length >= MAX_TARGETS) return;
    setTargets((prev) => [...prev, candidate]);
    setQuery('');
    setOpen(false);
  }

  function removeTarget(puuid: string) {
    setTargets((prev) => prev.filter((t) => t.puuid !== puuid));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createDuelAction(
        myPuuid,
        targets.map((t) => t.puuid),
        days,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/duels/${result.code}`);
    });
  }

  if (myAccounts.length === 0) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">Start a duel</div>
        </div>
        <p className={styles.empty}>
          Verify a Riot account first, then come back here to challenge someone.
        </p>
      </div>
    );
  }

  const canSubmit = myPuuid !== '' && targets.length > 0;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Start a duel</div>
        <div className="card-note">
          {targets.length}/{MAX_TARGETS} challenged
        </div>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.label}>Racing as</span>
          <select
            className={styles.select}
            value={myPuuid}
            onChange={(e) => setMyPuuid(e.target.value)}
          >
            {myAccounts.map((account) => (
              <option key={account.puuid} value={account.puuid}>
                {account.gameName}#{account.tagLine}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.field} ref={wrap}>
          <span className={styles.label}>Challenge</span>

          {targets.length > 0 ? (
            <div className={styles.chips}>
              {targets.map((target) => (
                <span className={styles.chip} key={target.puuid}>
                  {target.gameName}
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => removeTarget(target.puuid)}
                    aria-label={`Remove ${target.gameName}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {targets.length < MAX_TARGETS ? (
            <div className={styles.searchWrap}>
              <input
                className={styles.input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setOpen(true)}
                placeholder="Type a name…"
                autoComplete="off"
                spellCheck={false}
              />

              {open && suggestions.length > 0 ? (
                <div className={styles.menu} role="listbox">
                  {suggestions.map((candidate) => (
                    <button
                      key={candidate.puuid}
                      type="button"
                      className={styles.option}
                      onClick={() => addTarget(candidate)}
                    >
                      <span className={styles.optionName}>
                        {candidate.gameName}
                        <span className={styles.optionTag}>#{candidate.tagLine}</span>
                      </span>
                      {candidate.groupName ? (
                        <span className={styles.optionMeta}>in {candidate.groupName}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : open && query.trim().length > 0 ? (
                <div className={styles.menu}>
                  <div className={styles.menuEmpty}>No verified players match that name.</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={styles.footer}>
          <label className={styles.daysLabel}>
            Runs for
            <input
              className={styles.daysInput}
              type="number"
              min={1}
              max={30}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
            days
          </label>

          <button className={styles.submit} type="submit" disabled={!canSubmit || isPending}>
            {isPending ? 'Sending…' : 'Send challenge'}
          </button>
        </div>
      </form>

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
