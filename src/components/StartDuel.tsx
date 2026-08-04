'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createDuelAction } from '@/app/actions/duels';
import type { DuelCandidate } from '@/lib/duels';
import styles from './StartDuel.module.css';

const MIN_RACERS = 2;
const MAX_RACERS = 4;

interface Props {
  groupId: number;
  slug: string;
  candidates: DuelCandidate[];
}

/** Pick 2-4 people off the board and race their ranked LP for a week. */
export function StartDuel({ groupId, slug, candidates }: Props) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(puuid: string) {
    setError(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(puuid)) next.delete(puuid);
      else if (next.size < MAX_RACERS) next.add(puuid);
      return next;
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createDuelAction(groupId, slug, [...picked], days);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/duels/${result.code}`);
    });
  }

  if (candidates.length < MIN_RACERS) return null;

  const canSubmit = picked.size >= MIN_RACERS && picked.size <= MAX_RACERS;

  return (
    <div className="card section-gap">
      <div className="card-head">
        <div className="card-title">Start a duel</div>
        <div className="card-note">
          {picked.size}/{MAX_RACERS} picked
        </div>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.list}>
          {candidates.map((candidate) => {
            const checked = picked.has(candidate.puuid);
            const disabled = !checked && picked.size >= MAX_RACERS;
            return (
              <label
                key={candidate.puuid}
                className={`${styles.option} ${checked ? styles.checked : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(candidate.puuid)}
                />
                <span className={styles.name}>
                  {candidate.nickname ?? candidate.gameName}
                </span>
              </label>
            );
          })}
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
            {isPending ? 'Starting…' : 'Start duel'}
          </button>
        </div>
      </form>

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
