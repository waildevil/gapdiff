'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { searchFriendCandidatesAction, sendFriendRequestAction } from '@/app/actions/friends';
import type { FriendCandidate } from '@/lib/friends';
import styles from './FriendSearch.module.css';

const DEBOUNCE_MS = 200;

/** Search for people to add — groupmates by default, anyone by name once you type. */
export function FriendSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<FriendCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const result = await searchFriendCandidatesAction(query);
      if (id !== requestId.current) return;
      setSuggestions(result);
    }, query ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  async function add(candidate: FriendCandidate) {
    setError(null);
    const result = await sendFriendRequestAction(candidate.userId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentTo((prev) => new Set(prev).add(candidate.userId));
    router.refresh();
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Add a friend</div>
      </div>

      <div className={styles.searchWrap} ref={wrap}>
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
              <div className={styles.option} key={candidate.userId}>
                <span className={styles.optionName}>
                  {candidate.name ?? 'Unnamed'}
                  {candidate.groupName ? (
                    <span className={styles.optionMeta}>in {candidate.groupName}</span>
                  ) : null}
                </span>
                <button
                  className={styles.addBtn}
                  onClick={() => add(candidate)}
                  disabled={sentTo.has(candidate.userId)}
                >
                  {sentTo.has(candidate.userId) ? 'Sent' : 'Add'}
                </button>
              </div>
            ))}
          </div>
        ) : open && query.trim().length > 0 ? (
          <div className={styles.menu}>
            <div className={styles.menuEmpty}>No matching players.</div>
          </div>
        ) : null}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
