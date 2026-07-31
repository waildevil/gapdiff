'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { searchPlayers } from '@/app/actions/search';
import type { PlayerSuggestion } from '@/lib/playerIndex';
import { PLATFORMS, PLATFORM_LABELS, type Platform } from '@/lib/riot/routing';
import styles from './SearchForm.module.css';

interface SearchFormProps {
  size?: 'large' | 'compact';
  defaultPlatform?: Platform;
  defaultValue?: string;
}

const DEBOUNCE_MS = 200;

export function SearchForm({
  size = 'large',
  defaultPlatform = 'euw1',
  defaultValue = '',
}: SearchFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [platform, setPlatform] = useState<Platform>(defaultPlatform);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  /** Guards against a slow response overwriting a newer one. */
  const requestId = useRef(0);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const results = await searchPlayers(query);
      if (id !== requestId.current) return;
      setSuggestions(results);
      setActive(-1);
      setOpen(results.length > 0);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function go(gameName: string, tagLine: string, target: string) {
    setOpen(false);
    router.push(
      `/player/${target}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // An arrow-key selection wins over whatever is typed.
    if (open && active >= 0 && suggestions[active]) {
      const pick = suggestions[active];
      go(pick.gameName, pick.tagLine, pick.platform);
      return;
    }

    const trimmed = value.trim();
    const hash = trimmed.lastIndexOf('#');

    // Riot IDs are always Name#TAG — there is no name-only lookup any more.
    if (hash <= 0 || hash === trimmed.length - 1) {
      // If exactly one player matches what they typed, take it.
      if (suggestions.length === 1 && suggestions[0]) {
        const only = suggestions[0];
        go(only.gameName, only.tagLine, only.platform);
        return;
      }
      setError(
        suggestions.length > 1
          ? 'Several players match — pick one, or type the full Name#TAG.'
          : 'Riot IDs look like Name#TAG — include the tag after the #.',
      );
      return;
    }

    setError(null);
    go(trimmed.slice(0, hash).trim(), trimmed.slice(hash + 1).trim(), platform);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const typedName = value.trim().split('#')[0] ?? '';

  return (
    <div className={styles.wrap} ref={wrap}>
      <form
        className={`${styles.form} ${size === 'large' ? styles.large : ''}`}
        onSubmit={handleSubmit}
        autoComplete="off"
      >
        <select
          className={styles.select}
          value={platform}
          onChange={(event) => setPlatform(event.target.value as Platform)}
          aria-label="Region"
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>

        <div className={styles.inputWrap}>
          <input
            className={styles.input}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            onFocus={() => setOpen(suggestions.length > 0)}
            onKeyDown={handleKeyDown}
            placeholder="Name or Name#TAG"
            aria-label="Riot ID"
            aria-autocomplete="list"
            aria-expanded={open}
            spellCheck={false}
            autoComplete="off"
          />
          <button className={styles.submit} type="submit" disabled={!value.trim()}>
            Search
          </button>
        </div>
      </form>

      {open && suggestions.length > 0 ? (
        <div className={styles.menu} role="listbox">
          {suggestions.map((player, index) => (
            <button
              key={player.puuid}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`${styles.option} ${index === active ? styles.active : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(player.gameName, player.tagLine, player.platform)}
            >
              <span className={styles.optionName}>
                <Highlight text={player.gameName} match={typedName} />
                <span className={styles.optionTag}>#{player.tagLine}</span>
              </span>
              <span className={styles.optionMeta}>
                {player.platform.toUpperCase()} · seen {player.gamesSeen}×
              </span>
            </button>
          ))}
          <div className={styles.menuNote}>
            Only players we&apos;ve seen in an ingested game. Type a full Name#TAG for
            anyone else.
          </div>
        </div>
      ) : null}

      {error ? (
        <p className={styles.error}>{error}</p>
      ) : size === 'large' && !open ? (
        <p className={styles.hint}>
          Start typing a name — your tag is the part after the # in the client.
        </p>
      ) : null}
    </div>
  );
}

/** Bolds the part of the name the user has actually typed. */
function Highlight({ text, match }: { text: string; match: string }) {
  const at = match ? text.toLowerCase().indexOf(match.toLowerCase()) : -1;
  if (at < 0 || match.length === 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, at)}
      <span className={styles.match}>{text.slice(at, at + match.length)}</span>
      {text.slice(at + match.length)}
    </>
  );
}
