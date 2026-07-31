'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PLATFORMS, PLATFORM_LABELS, type Platform } from '@/lib/riot/routing';
import styles from './SearchForm.module.css';

interface SearchFormProps {
  size?: 'large' | 'compact';
  defaultPlatform?: Platform;
  defaultValue?: string;
}

export function SearchForm({
  size = 'large',
  defaultPlatform = 'euw1',
  defaultValue = '',
}: SearchFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [platform, setPlatform] = useState<Platform>(defaultPlatform);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();

    // Riot IDs are always Name#TAG — there is no name-only lookup any more.
    const hash = trimmed.lastIndexOf('#');
    if (hash <= 0 || hash === trimmed.length - 1) {
      setError('Riot IDs look like Name#TAG — include the tag after the #.');
      return;
    }

    const gameName = trimmed.slice(0, hash).trim();
    const tagLine = trimmed.slice(hash + 1).trim();
    setError(null);
    router.push(
      `/player/${platform}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    );
  }

  return (
    <div className={size === 'large' ? styles.large : undefined}>
      <form className={`${styles.form} ${size === 'large' ? styles.large : ''}`} onSubmit={handleSubmit}>
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
            onChange={(event) => setValue(event.target.value)}
            placeholder="Name#TAG"
            aria-label="Riot ID"
            spellCheck={false}
            autoComplete="off"
          />
          <button className={styles.submit} type="submit" disabled={!value.trim()}>
            Search
          </button>
        </div>
      </form>

      {error ? (
        <p className={styles.error}>{error}</p>
      ) : size === 'large' ? (
        <p className={styles.hint}>Your tag is the part after the # in the client, e.g. anvil#DEVIL</p>
      ) : null}
    </div>
  );
}
