/**
 * Placeholder data so the UI runs before the database and Riot key exist.
 *
 * Shapes match what the ingestion worker will write, so swapping these for real
 * Drizzle queries is a substitution rather than a rewrite. Delete this file once
 * `src/scripts/ingest.ts` has run against a real group.
 */

export interface MockPlayer {
  id: string;
  name: string;
  tag: string;
  nickname: string;
  rank: { tier: string; division: string; leaguePoints: number } | null;
  gapScore: number;
  rankScore: number | null;
  performanceScore: number;
  consistencyScore: number;
  wins: number;
  losses: number;
  mainRole: string;
  /** Change in leaderboard position since last week. */
  movement: number;
  champions: string[];
  /** Per-game performance scores, most recent first. */
  form: number[];
}

export const MOCK_GROUP = { slug: 'the-boys', name: 'The Boys', platform: 'euw1' };

export const MOCK_PLAYERS: MockPlayer[] = [
  {
    id: 'wail', name: 'wail', tag: 'EUW', nickname: 'the shotcaller',
    rank: { tier: 'EMERALD', division: 'II', leaguePoints: 47 },
    gapScore: 78.4, rankScore: 74.2, performanceScore: 81.6, consistencyScore: 79.0,
    wins: 62, losses: 41, mainRole: 'MIDDLE', movement: 0,
    champions: ['Ahri', 'Orianna', 'Sylas'],
    form: [72, 68, 84, 91, 77, 63, 88, 79, 82, 74, 90, 66, 85, 81, 76, 93, 70, 87, 83, 79],
  },
  {
    id: 'sami', name: 'sami', tag: 'EUW', nickname: 'perma-invade',
    rank: { tier: 'DIAMOND', division: 'IV', leaguePoints: 12 },
    gapScore: 76.1, rankScore: 79.8, performanceScore: 77.4, consistencyScore: 62.1,
    wins: 88, losses: 74, mainRole: 'JUNGLE', movement: 2,
    champions: ['Lee Sin', 'Viego', 'Vi'],
    form: [91, 54, 88, 42, 95, 61, 79, 86, 48, 92, 57, 84, 73, 96, 51, 88, 65, 90, 44, 87],
  },
  {
    id: 'karim', name: 'karim', tag: 'EUW', nickname: 'farm simulator',
    rank: { tier: 'PLATINUM', division: 'I', leaguePoints: 88 },
    gapScore: 68.9, rankScore: 63.5, performanceScore: 72.8, consistencyScore: 71.4,
    wins: 51, losses: 44, mainRole: 'BOTTOM', movement: -1,
    champions: ['Jinx', "Kai'Sa", 'Caitlyn'],
    form: [77, 71, 65, 83, 74, 69, 80, 62, 76, 88, 70, 73, 67, 81, 75, 72, 79, 68, 84, 71],
  },
  {
    id: 'yousef', name: 'yousef', tag: 'EUW', nickname: 'ward andy',
    rank: { tier: 'PLATINUM', division: 'III', leaguePoints: 34 },
    gapScore: 61.2, rankScore: 57.1, performanceScore: 64.9, consistencyScore: 63.8,
    wins: 39, losses: 35, mainRole: 'UTILITY', movement: 1,
    champions: ['Thresh', 'Nautilus', 'Lulu'],
    form: [64, 70, 58, 72, 66, 61, 75, 59, 68, 63, 71, 57, 69, 74, 62, 65, 60, 73, 67, 64],
  },
  {
    id: 'omar', name: 'omar', tag: 'EUW', nickname: 'the wall',
    rank: { tier: 'GOLD', division: 'I', leaguePoints: 61 },
    gapScore: 55.7, rankScore: 51.3, performanceScore: 58.2, consistencyScore: 60.4,
    wins: 44, losses: 42, mainRole: 'TOP', movement: -2,
    champions: ['Sett', 'Darius', 'Camille'],
    form: [58, 62, 51, 66, 55, 60, 47, 71, 54, 63, 49, 68, 57, 52, 65, 59, 61, 48, 70, 56],
  },
  {
    id: 'bilal', name: 'bilal', tag: 'EUW', nickname: 'int merchant',
    rank: { tier: 'GOLD', division: 'III', leaguePoints: 9 },
    gapScore: 49.3, rankScore: 44.8, performanceScore: 52.7, consistencyScore: 51.1,
    wins: 33, losses: 38, mainRole: 'MIDDLE', movement: 0,
    champions: ['Yasuo', 'Yone', 'Zed'],
    form: [39, 88, 31, 72, 45, 91, 28, 64, 52, 83, 35, 77, 41, 69, 33, 86, 47, 58, 30, 74],
  },
  {
    id: 'adam', name: 'adam', tag: 'EUW', nickname: 'weekend warrior',
    rank: { tier: 'SILVER', division: 'II', leaguePoints: 74 },
    gapScore: 41.8, rankScore: 33.2, performanceScore: 47.1, consistencyScore: 49.6,
    wins: 21, losses: 19, mainRole: 'BOTTOM', movement: 1,
    champions: ['Ezreal', 'Jhin', 'Lucian'],
    form: [45, 51, 42, 48, 55, 39, 47, 52, 44, 50, 46, 41, 53, 49, 43, 47, 54, 40, 46, 51],
  },
  {
    id: 'tarek', name: 'tarek', tag: 'EUW', nickname: 'placements pending',
    rank: null,
    gapScore: 38.6, rankScore: null, performanceScore: 41.2, consistencyScore: 34.1,
    wins: 4, losses: 3, mainRole: 'TOP', movement: 0,
    champions: ['Garen', 'Malphite'],
    form: [52, 28, 61, 35, 44, 22, 58],
  },
];

export function mockPlayer(id: string): MockPlayer | undefined {
  return MOCK_PLAYERS.find((p) => p.id === id);
}
