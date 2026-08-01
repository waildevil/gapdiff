'use client';

import { useMemo, useState } from 'react';
import { championIcon } from '@/lib/ddragon';
import {
  championsFromHistory,
  queueMatchesFilter,
  type ChampionQueueRow,
} from '@/lib/champions';
import type { ChampionMatchup } from '@/lib/championHistory';
import { perfColor, winRate } from '@/lib/format';
import { QUEUE_FILTERS } from '@/lib/profile';
import styles from './ChampionTable.module.css';

/** Matchups revealed per click. Five fits without burying the next champion. */
const MATCHUP_PAGE = 5;

interface ChampionTableProps {
  history: ChampionQueueRow[];
  matchups: ChampionMatchup[];
  version: string;
}

/**
 * Every champion, with the lane matchups behind each one.
 *
 * The matchup rows are the part no public site can compute for a private
 * account cheaply — they come from the same role pairing the scorer uses, so a
 * matchup record and a lane-duel score always agree about who the opponent was.
 */
export function ChampionTable({ history, matchups, version }: ChampionTableProps) {
  const [filterId, setFilterId] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  /** Reset whenever a different champion opens, so each starts at five. */
  const [shownMatchups, setShownMatchups] = useState(MATCHUP_PAGE);

  function toggle(championName: string) {
    setOpen((current) => (current === championName ? null : championName));
    setShownMatchups(MATCHUP_PAGE);
  }

  const tabs = useMemo(() => {
    const queueIds = [...new Set(history.map((row) => row.queueId))];
    return QUEUE_FILTERS.filter(
      (filter) =>
        filter.id === 'all' ||
        queueIds.some((queueId) => queueMatchesFilter(filter.id, queueId)),
    );
  }, [history]);

  const champs = useMemo(
    () => championsFromHistory(history, filterId),
    [history, filterId],
  );

  /** Matchups for the open champion, in the selected queue, most-played first. */
  const openMatchups = useMemo(() => {
    if (open === null) return [];
    const byOpponent = new Map<string, { opponent: string; games: number; wins: number }>();

    for (const row of matchups) {
      if (row.championName !== open) continue;
      if (!queueMatchesFilter(filterId, row.queueId)) continue;

      const seen = byOpponent.get(row.opponent);
      if (seen) {
        seen.games += row.games;
        seen.wins += row.wins;
      } else {
        byOpponent.set(row.opponent, {
          opponent: row.opponent,
          games: row.games,
          wins: row.wins,
        });
      }
    }

    return [...byOpponent.values()].sort((a, b) => b.games - a.games || a.opponent.localeCompare(b.opponent));
  }, [open, matchups, filterId]);

  const totals = champs.reduce(
    (acc, c) => ({ games: acc.games + c.games, wins: acc.wins + c.wins }),
    { games: 0, wins: 0 },
  );

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">All champions</div>
        <div className="card-note">
          {champs.length} champions · {totals.games} games · click a row for matchups
        </div>
      </div>

      {tabs.length > 1 ? (
        <div className={styles.tabs}>
          {tabs.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`${styles.tab} ${filter.id === filterId ? styles.tabOn : ''}`}
              onClick={() => {
                setFilterId(filter.id);
                setOpen(null);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.scroll}>
        <div className={styles.header}>
          <div className={styles.pos}>#</div>
          <div>Champion</div>
          <div className={styles.num}>Played</div>
          <div className={styles.num}>KDA</div>
          <div className={styles.num}>K / D / A</div>
          <div className={styles.num}>CS/m</div>
          <div className={styles.num}>Vision</div>
          <div className={styles.num}>Gap</div>
        </div>

        {champs.length === 0 ? (
          <div className={styles.empty}>No games in this queue.</div>
        ) : (
          champs.map((champ, index) => {
            const isOpen = open === champ.championName;

            return (
              <div key={champ.championName}>
                <button
                  type="button"
                  className={`${styles.row} ${isOpen ? styles.rowOpen : ''}`}
                  onClick={() => toggle(champ.championName)}
                  aria-expanded={isOpen}
                >
                  <div className={styles.pos}>{index + 1}</div>

                  <div className={styles.champ}>
                    <img
                      className={styles.icon}
                      src={championIcon(version, champ.championName)}
                      alt=""
                      loading="lazy"
                    />
                    <span className={styles.name}>{champ.championName}</span>
                  </div>

                  <div className={styles.num}>
                    <div className={styles.bar}>
                      <div
                        className={styles.barWins}
                        style={{ width: `${champ.winRate}%` }}
                      />
                    </div>
                    <div className={styles.record}>
                      <span className={styles.wins}>{champ.wins}W</span>{' '}
                      <span className={styles.losses}>{champ.losses}L</span>{' '}
                      <span className={champ.winRate >= 50 ? styles.good : styles.bad}>
                        {champ.winRate}%
                      </span>
                    </div>
                  </div>

                  <div className={styles.num}>{champ.kda.toFixed(2)}:1</div>
                  <div className={styles.num}>
                    {(champ.kills / champ.games).toFixed(1)} /{' '}
                    <span className={styles.deaths}>
                      {(champ.deaths / champ.games).toFixed(1)}
                    </span>{' '}
                    / {(champ.assists / champ.games).toFixed(1)}
                  </div>
                  <div className={styles.num}>{champ.csPerMin.toFixed(1)}</div>
                  <div className={styles.num}>{champ.visionScore.toFixed(0)}</div>
                  <div
                    className={styles.num}
                    style={{
                      color:
                        champ.avgGapScore === null
                          ? 'var(--faint)'
                          : perfColor(champ.avgGapScore),
                      fontWeight: 650,
                    }}
                  >
                    {champ.avgGapScore === null ? '—' : champ.avgGapScore.toFixed(0)}
                  </div>
                </button>

                {isOpen ? (
                  <div className={styles.matchups}>
                    {openMatchups.length === 0 ? (
                      <div className={styles.noMatchups}>
                        No lane opponent was recorded on this champion — Riot only
                        infers roles on Summoner&apos;s Rift queues.
                      </div>
                    ) : (
                      openMatchups.slice(0, shownMatchups).map((m) => {
                        const losses = m.games - m.wins;
                        const rate = winRate(m.wins, losses);
                        return (
                          <div key={m.opponent} className={styles.matchup}>
                            <span className={styles.vs}>vs</span>
                            <img
                              className={styles.iconSmall}
                              src={championIcon(version, m.opponent)}
                              alt=""
                              loading="lazy"
                            />
                            <span className={styles.opponent}>{m.opponent}</span>
                            <span className={styles.matchupRecord}>
                              <span className={styles.wins}>{m.wins}W</span>{' '}
                              <span className={styles.losses}>{losses}L</span>
                            </span>
                            <span className={rate >= 50 ? styles.good : styles.bad}>
                              {rate}%
                            </span>
                          </div>
                        );
                      })
                    )}

                    {openMatchups.length > shownMatchups ? (
                      <button
                        type="button"
                        className={styles.loadMore}
                        onClick={() =>
                          setShownMatchups((count) => count + MATCHUP_PAGE)
                        }
                      >
                        Load {Math.min(MATCHUP_PAGE, openMatchups.length - shownMatchups)}{' '}
                        more · {openMatchups.length - shownMatchups} left
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
