import { clamp } from './score';

/**
 * The leaderboard number.
 *
 * Gap Score (0-100) = 40% rank + 40% performance + 20% consistency.
 *
 * Every component is exposed on the result so the UI can show *why* someone is
 * first. An opaque score nobody can argue with is a score nobody cares about.
 */

export const TIERS = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
  'MASTER',
  'GRANDMASTER',
  'CHALLENGER',
] as const;

export type Tier = (typeof TIERS)[number];

const DIVISIONS = ['IV', 'III', 'II', 'I'] as const;
export type Division = (typeof DIVISIONS)[number];

/** Diamond I 100 LP, the point where divisions stop existing. */
const APEX_FLOOR = 2800;
/** Normalisation ceiling: roughly high Master. Anything above clamps to 100. */
const MAX_RANK_POINTS = 3600;

/** Collapses tier + division + LP into one ladder position. */
export function rankPoints(tier: string, division: string, leaguePoints: number): number {
  const tierIndex = TIERS.indexOf(tier.toUpperCase() as Tier);
  if (tierIndex < 0) return 0;

  // Master, Grandmaster and Challenger share one pool with no divisions.
  if (tierIndex >= TIERS.indexOf('MASTER')) {
    return APEX_FLOOR + leaguePoints;
  }

  const divisionIndex = DIVISIONS.indexOf(division.toUpperCase() as Division);
  return tierIndex * 400 + Math.max(0, divisionIndex) * 100 + leaguePoints;
}

export function normalisedRank(points: number): number {
  return clamp((points / MAX_RANK_POINTS) * 100, 0, 100);
}

export function formatRank(tier: string, division: string, leaguePoints: number): string {
  const upper = tier.toUpperCase();
  const pretty = upper.charAt(0) + upper.slice(1).toLowerCase();
  if (TIERS.indexOf(upper as Tier) >= TIERS.indexOf('MASTER')) {
    return `${pretty} ${leaguePoints} LP`;
  }
  return `${pretty} ${division} ${leaguePoints} LP`;
}

// --- aggregation ----------------------------------------------------------

/** Recent form counts more: weight halves every ~20 games. */
const HALF_LIFE_GAMES = 20;
/** Bayesian shrinkage strength — games needed before you own your average. */
const SHRINKAGE_K = 15;
/** Same idea for spread, which needs fewer games to say something. */
const CONSISTENCY_SHRINKAGE_K = 8;
/** Std-dev of performance that maps to a consistency score of 0. */
const MAX_STDDEV = 22;

export interface RatingInput {
  /** Per-game performance scores, **most recent first**. */
  scores: number[];
  wins: number;
  losses: number;
  rank?: { tier: string; division: string; leaguePoints: number } | null;
  /** Prior to shrink towards — the group mean, or 50 when there isn't one. */
  prior?: number;
}

export interface Rating {
  /** False when there are no games to score — shown as "—", never ranked. */
  rated: boolean;
  gapScore: number;
  /** 0-100 components, before weighting. */
  rankScore: number | null;
  performanceScore: number;
  consistencyScore: number;
  /** Unshrunk average, for display alongside the adjusted number. */
  rawPerformance: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  /** How much the sample size is trusted, 0-1. */
  confidence: number;
}

function exponentialWeightedMean(scores: number[]): number {
  if (scores.length === 0) return 0;
  const decay = Math.log(2) / HALF_LIFE_GAMES;
  let weighted = 0;
  let weightSum = 0;
  scores.forEach((score, index) => {
    const weight = Math.exp(-decay * index);
    weighted += score * weight;
    weightSum += weight;
  });
  return weighted / weightSum;
}

function standardDeviation(scores: number[], mean: number): number {
  if (scores.length < 2) return 0;
  const variance =
    scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / (scores.length - 1);
  return Math.sqrt(variance);
}

export function computeRating(input: RatingInput): Rating {
  const { scores, wins, losses } = input;
  const games = scores.length;
  const prior = input.prior ?? 50;
  const total = wins + losses;

  const rankScore = input.rank
    ? normalisedRank(
        rankPoints(input.rank.tier, input.rank.division, input.rank.leaguePoints),
      )
    : null;

  /*
   * Nobody with zero games gets a score.
   *
   * The maths used to hand them one, and a flattering one: performance fell
   * back to the group mean and standard deviation of nothing is zero, which
   * read as perfect consistency. A player who had never been ingested came out
   * top of the board on 75.3.
   */
  if (games === 0) {
    return {
      rated: false,
      gapScore: 0,
      rankScore: rankScore === null ? null : Math.round(rankScore * 10) / 10,
      performanceScore: 0,
      consistencyScore: 0,
      rawPerformance: 0,
      games: 0,
      wins,
      losses,
      winRate: total > 0 ? wins / total : 0,
      confidence: 0,
    };
  }

  const rawPerformance = exponentialWeightedMean(scores);

  // Four great games shouldn't outrank fifty good ones until they're proven.
  const performanceScore =
    (games * rawPerformance + SHRINKAGE_K * prior) / (games + SHRINKAGE_K);

  const arithmeticMean = scores.reduce((sum, s) => sum + s, 0) / games;
  const stdDev = standardDeviation(scores, arithmeticMean);
  const rawConsistency = clamp(100 - (stdDev / MAX_STDDEV) * 100, 0, 100);

  // Spread needs a sample. One or two games have a standard deviation of zero
  // by definition, which is not the same as being consistent — so shrink
  // towards neutral until there are enough games to mean something.
  const consistencyScore =
    (games * rawConsistency + CONSISTENCY_SHRINKAGE_K * 50) /
    (games + CONSISTENCY_SHRINKAGE_K);

  // Unranked players still get a fair score: the rank weight is redistributed
  // across the two components we can actually measure.
  const gapScore =
    rankScore === null
      ? 0.65 * performanceScore + 0.35 * consistencyScore
      : 0.4 * rankScore + 0.4 * performanceScore + 0.2 * consistencyScore;

  return {
    rated: true,
    gapScore: Math.round(gapScore * 10) / 10,
    rankScore: rankScore === null ? null : Math.round(rankScore * 10) / 10,
    performanceScore: Math.round(performanceScore * 10) / 10,
    consistencyScore: Math.round(consistencyScore * 10) / 10,
    rawPerformance: Math.round(rawPerformance * 10) / 10,
    games,
    wins,
    losses,
    winRate: total > 0 ? wins / total : 0,
    confidence: clamp(games / (games + SHRINKAGE_K), 0, 1),
  };
}

export interface LeaderboardEntry<T> {
  player: T;
  rating: Rating;
  position: number;
  /** Gap to the player above — the number the group will actually argue about. */
  gapToNext: number;
}

/**
 * Ranks a group. The shrinkage prior is the group's own mean performance, so
 * "average" means average *for this group* rather than an arbitrary 50.
 */
export function buildLeaderboard<T>(
  players: { player: T; input: Omit<RatingInput, 'prior'> }[],
): LeaderboardEntry<T>[] {
  const withGames = players.filter((p) => p.input.scores.length > 0);
  const groupMean =
    withGames.length > 0
      ? withGames.reduce(
          (sum, p) =>
            sum + p.input.scores.reduce((a, b) => a + b, 0) / p.input.scores.length,
          0,
        ) / withGames.length
      : 50;

  const rated = players
    .map(({ player, input }) => ({
      player,
      rating: computeRating({ ...input, prior: groupMean }),
    }))
    /*
     * Three tiers, in order:
     *   1. rated and ranked
     *   2. rated but unranked  — scored without a rank pillar, so nothing drags
     *      it down; comparing it directly against a ranked score would make
     *      having no rank an advantage
     *   3. no games at all     — not scored, so nothing to compare
     * Within each tier the score decides.
     */
    .sort((a, b) => {
      if (a.rating.rated !== b.rating.rated) return a.rating.rated ? -1 : 1;

      const aRanked = a.rating.rankScore !== null;
      const bRanked = b.rating.rankScore !== null;
      if (aRanked !== bRanked) return aRanked ? -1 : 1;

      return b.rating.gapScore - a.rating.gapScore;
    });

  return rated.map((entry, index) => {
    const above = index === 0 ? undefined : rated[index - 1];
    return {
      ...entry,
      position: index + 1,
      gapToNext: above
        ? Math.round((above.rating.gapScore - entry.rating.gapScore) * 10) / 10
        : 0,
    };
  });
}
