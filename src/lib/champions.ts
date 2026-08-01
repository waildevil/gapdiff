import { winRate } from './format';
import { queueFilter, type ProfileMatch } from './profile';

export interface ChampionStats {
  championName: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
  kills: number;
  deaths: number;
  assists: number;
  csPerMin: number;
  visionScore: number;
  avgGapScore: number | null;
}

/**
 * One champion in one queue, as stored. Kept unaggregated across queues so the
 * sidebar can re-total for whichever tab is selected without another query.
 */
export interface ChampionQueueRow {
  championName: string;
  queueId: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  csPerMinTotal: number;
  visionTotal: number;
  scoreTotal: number;
  scoredGames: number;
}

/** Does a stored queue id belong to the tab the user has selected? */
export function queueMatchesFilter(filterId: string, queueId: number): boolean {
  const filter = queueFilter(filterId);
  if (filter.id === 'all') return true;
  if (filter.includeQueues) return filter.includeQueues.includes(queueId);
  if (filter.queue !== undefined) return queueId === filter.queue;
  return true;
}

/** Re-totals stored rows for one queue tab. */
export function championsFromHistory(
  rows: ChampionQueueRow[],
  filterId: string,
): ChampionStats[] {
  const byChamp = new Map<string, ChampionQueueRow>();

  for (const row of rows) {
    if (!queueMatchesFilter(filterId, row.queueId)) continue;

    const existing = byChamp.get(row.championName);
    if (!existing) {
      byChamp.set(row.championName, { ...row });
      continue;
    }

    existing.games += row.games;
    existing.wins += row.wins;
    existing.kills += row.kills;
    existing.deaths += row.deaths;
    existing.assists += row.assists;
    existing.csPerMinTotal += row.csPerMinTotal;
    existing.visionTotal += row.visionTotal;
    existing.scoreTotal += row.scoreTotal;
    existing.scoredGames += row.scoredGames;
  }

  return [...byChamp.values()]
    .map((row) => ({
      championName: row.championName,
      games: row.games,
      wins: row.wins,
      losses: row.games - row.wins,
      winRate: winRate(row.wins, row.games - row.wins),
      // Pooled, so one deathless game can't produce an infinite KDA.
      kda:
        row.deaths === 0
          ? row.kills + row.assists
          : (row.kills + row.assists) / row.deaths,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      csPerMin: row.games ? row.csPerMinTotal / row.games : 0,
      visionScore: row.games ? row.visionTotal / row.games : 0,
      avgGapScore: row.scoredGames ? row.scoreTotal / row.scoredGames : null,
    }))
    .sort((a, b) => b.games - a.games);
}

export function summariseChampions(matches: ProfileMatch[]): ChampionStats[] {
  const byChamp = new Map<
    string,
    {
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
      csPerMin: number[];
      visionScore: number[];
      scores: (number | null)[];
    }
  >();

  for (const match of matches) {
    if (match.remake) continue;

    const key = match.championName;
    let stats = byChamp.get(key);
    if (!stats) {
      stats = {
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        csPerMin: [],
        visionScore: [],
        scores: [],
      };
      byChamp.set(key, stats);
    }

    stats.games += 1;
    if (match.win) stats.wins += 1;
    stats.kills += match.kills;
    stats.deaths += match.deaths;
    stats.assists += match.assists;
    stats.csPerMin.push(match.csPerMin);
    stats.visionScore.push(match.visionScore);
    stats.scores.push(match.performanceScore);
  }

  const mean = (values: number[]) =>
    values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

  return [...byChamp.entries()]
    .map(([championName, stats]) => {
      const avgScore = stats.scores.filter((s) => s !== null) as number[];
      return {
        championName,
        games: stats.games,
        wins: stats.wins,
        losses: stats.games - stats.wins,
        winRate: winRate(stats.wins, stats.games - stats.wins),
        kda:
          stats.deaths === 0
            ? stats.kills + stats.assists
            : (stats.kills + stats.assists) / stats.deaths,
        kills: stats.kills,
        deaths: stats.deaths,
        assists: stats.assists,
        csPerMin: mean(stats.csPerMin),
        visionScore: mean(stats.visionScore),
        avgGapScore: avgScore.length
          ? mean(avgScore)
          : null,
      };
    })
    .sort((a, b) => b.games - a.games);
}
