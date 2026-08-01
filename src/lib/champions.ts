import { winRate } from './format';
import type { ProfileMatch } from './profile';

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
