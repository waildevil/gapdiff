'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { championIcon } from '@/lib/ddragon';
import {
  championsFromHistory,
  queueMatchesFilter,
  summariseChampions,
  type ChampionQueueRow,
} from '@/lib/champions';
import { perfColor } from '@/lib/format';
import { QUEUE_FILTERS, type ProfileMatch } from '@/lib/profile';
import styles from './ChampionSidebar.module.css';

interface ChampionSidebarProps {
  /** Stored history from the database. Empty for untracked accounts. */
  history: ChampionQueueRow[];
  /** Link base for the full-pool page. */
  profileHref: string;
  /**
   * Live-fetched matches. For a tracked account these are just the visible
   * match list; for an untracked one the caller fetches a deeper batch
   * specifically so this panel isn't stuck at a token ten games.
   */
  matches: ProfileMatch[];
  version: string;
}

const SHOWN = 8;

/**
 * Champion pool, in the left column where op.gg puts it.
 *
 * Tracked accounts get their whole season out of the database; everybody
 * else is built from live-fetched matches instead — same shape, same
 * caption, just a shallower sample since it costs real Riot calls to fetch.
 */
export function ChampionSidebar({
  history,
  profileHref,
  matches,
  version,
}: ChampionSidebarProps) {
  const [filterId, setFilterId] = useState('all');

  const stored = history.length > 0;

  const champs = useMemo(
    () => (stored ? championsFromHistory(history, filterId) : summariseChampions(matches)),
    [stored, history, filterId, matches],
  );

  /**
   * The ingester only stores rated queues, so ARAM and Arena are never in the
   * history. Offering those tabs would guarantee an empty panel, so the tab
   * strip is built from what was actually stored.
   */
  const tabs = useMemo(() => {
    const queueIds = [...new Set(history.map((row) => row.queueId))];
    return QUEUE_FILTERS.filter(
      (filter) =>
        filter.id === 'all' ||
        queueIds.some((queueId) => queueMatchesFilter(filter.id, queueId)),
    );
  }, [history]);

  const visible = champs.slice(0, SHOWN);
  const games = champs.reduce((sum, c) => sum + c.games, 0);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.label}>Champions</div>
        <div className={styles.caption}>{games} games this season</div>
      </div>

      {/* Only the stored history can be re-totalled per queue; the ten live
          matches are already whatever the match list is showing. */}
      {stored && tabs.length > 1 ? (
        <div className={styles.tabs}>
          {tabs.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`${styles.tab} ${filter.id === filterId ? styles.tabOn : ''}`}
              onClick={() => setFilterId(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}

      {champs.length === 0 ? (
        <div className={styles.hint}>No games in this queue.</div>
      ) : (
        <>
          <div className={styles.list}>
            {visible.map((champ) => (
              <div key={champ.championName} className={styles.row}>
                <img
                  className={styles.icon}
                  src={championIcon(version, champ.championName)}
                  alt=""
                  loading="lazy"
                />

                <div className={styles.info}>
                  <div className={styles.name}>{champ.championName}</div>
                  <div className={styles.kda}>
                    {champ.kda.toFixed(2)}:1 KDA
                    <span className={styles.dim}>
                      {' · '}
                      {champ.csPerMin.toFixed(1)} CS/m
                    </span>
                  </div>
                  <div className={styles.detail}>
                    {(champ.kills / champ.games).toFixed(1)} /{' '}
                    <span className={styles.deaths}>
                      {(champ.deaths / champ.games).toFixed(1)}
                    </span>{' '}
                    / {(champ.assists / champ.games).toFixed(1)}
                  </div>
                </div>

                <div className={styles.right}>
                  <div
                    className={champ.wins >= champ.losses ? styles.good : styles.bad}
                  >
                    {champ.winRate}%
                  </div>
                  <div className={styles.games}>
                    {champ.games} {champ.games === 1 ? 'game' : 'games'}
                  </div>
                  {champ.avgGapScore !== null ? (
                    <div
                      className={styles.score}
                      style={{ color: perfColor(champ.avgGapScore) }}
                      title="Average Gap Score on this champion"
                    >
                      {champ.avgGapScore.toFixed(0)}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {/* The full pool lives on its own page, where there is room for the
              lane matchups behind each champion. */}
          {champs.length > SHOWN ? (
            <Link className={styles.more} href={`${profileHref}/champions`}>
              Show all {champs.length} →
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}
