'use client';

import { useMemo, useState, useTransition } from 'react';
import { fetchMatches } from '@/app/player/[platform]/[gameName]/[tagLine]/actions';
import { QUEUE_FILTERS, queueFilter, type ProfileMatch } from '@/lib/profile';
import { perfColor } from '@/lib/format';
import type { Platform } from '@/lib/riot/routing';
import { MatchCard } from './MatchCard';
import styles from './MatchSection.module.css';

interface MatchSectionProps {
  initialMatches: ProfileMatch[];
  initialHasMore: boolean;
  initialNextStart: number;
  puuid: string;
  platform: Platform;
  version: string;
}

export function MatchSection({
  initialMatches,
  initialHasMore,
  initialNextStart,
  puuid,
  platform,
  version,
}: MatchSectionProps) {
  const [filterId, setFilterId] = useState('all');
  const [matches, setMatches] = useState(initialMatches);
  const [hasMore, setHasMore] = useState(initialHasMore);
  // Riot pages by match-id offset, which drifts from matches.length whenever a
  // page is narrowed by a tab or an individual match fetch fails.
  const [nextStart, setNextStart] = useState(initialNextStart);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Distinguishes "swapping queue" from "appending a page" for the UI.
  const [switching, setSwitching] = useState(false);

  const stats = useMemo(() => summarise(matches), [matches]);

  function selectFilter(nextId: string) {
    if (nextId === filterId || isPending) return;
    setFilterId(nextId);
    setError(null);
    setSwitching(true);

    startTransition(async () => {
      const result = await fetchMatches(platform, puuid, 0, nextId);
      setSwitching(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMatches(result.matches);
      setHasMore(result.hasMore);
      setNextStart(result.nextStart);
    });
  }

  function loadMore() {
    setError(null);
    startTransition(async () => {
      const result = await fetchMatches(platform, puuid, nextStart, filterId);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Riot occasionally repeats a match across pages; keep the list unique.
      setMatches((current) => {
        const seen = new Set(current.map((m) => m.matchId));
        return [...current, ...result.matches.filter((m) => !seen.has(m.matchId))];
      });
      setHasMore(result.hasMore);
      setNextStart(result.nextStart);
    });
  }

  const activeLabel = queueFilter(filterId).label;

  return (
    <>
      <div className="grid grid-4 section-gap">
        <Stat
          label="Games shown"
          value={String(stats.games)}
          foot={`${stats.wins}W ${stats.losses}L`}
        />
        <Stat label="Win rate" value={`${stats.winRate}%`} foot={`in ${activeLabel}`} />
        <Stat
          label="Average KDA"
          value={stats.avgKda.toFixed(2)}
          foot={`${stats.avgCsPerMin.toFixed(1)} CS per minute`}
        />
        <Stat
          label="Average score"
          value={stats.avgScore === null ? '—' : stats.avgScore.toFixed(1)}
          foot={stats.avgScore === null ? 'this queue is not scored' : '0–100, versus each lobby'}
          color={stats.avgScore === null ? undefined : perfColor(stats.avgScore)}
        />
      </div>

      <div className="card section-gap">
        <div className="card-head">
          <div className="card-title">Match history</div>
          <div className="card-note">click a game for the full scoreboard</div>
        </div>

        <div className={styles.tabs} role="tablist">
          {QUEUE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              className={styles.tab}
              role="tab"
              aria-selected={filter.id === filterId}
              onClick={() => selectFilter(filter.id)}
              disabled={isPending}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {matches.length === 0 && !switching ? (
            <div className={styles.empty}>
              No {activeLabel === 'All' ? '' : `${activeLabel} `}games found.
              <div className={styles.emptyHint}>
                Riot keeps roughly the last two years of match history.
              </div>
            </div>
          ) : (
            <div className={switching ? styles.stale : undefined}>
              {matches.map((match) => (
                <MatchCard
                  key={match.matchId}
                  match={match}
                  version={version}
                  platform={platform}
                />
              ))}
            </div>
          )}

          {switching ? <div className={styles.overlay}>Loading {activeLabel}</div> : null}
        </div>

        {matches.length > 0 ? (
          <div className={styles.footer}>
            {error ? <p className={styles.error}>{error}</p> : null}

            {hasMore ? (
              <button className={styles.loadMore} onClick={loadMore} disabled={isPending}>
                {isPending && !switching ? 'Loading…' : 'Load 10 more games'}
              </button>
            ) : (
              <p className={styles.done}>That&apos;s the end of the match history.</p>
            )}

            <p className={styles.count}>
              {matches.length} {activeLabel === 'All' ? '' : `${activeLabel} `}games loaded
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}

function summarise(matches: ProfileMatch[]) {
  const wins = matches.filter((m) => m.win).length;
  const scored = matches.filter((m) => m.performanceScore !== null);
  const average = (values: number[]) =>
    values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

  return {
    games: matches.length,
    wins,
    losses: matches.length - wins,
    winRate: matches.length ? Math.round((wins / matches.length) * 100) : 0,
    avgKda: average(matches.map((m) => m.kda)),
    avgCsPerMin: average(matches.map((m) => m.csPerMin)),
    avgScore: scored.length ? average(scored.map((m) => m.performanceScore!)) : null,
  };
}

function Stat({
  label,
  value,
  foot,
  color,
}: {
  label: string;
  value: string;
  foot: string;
  color?: string;
}) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="stat-foot">{foot}</div>
    </div>
  );
}
