import type { Match } from '../riot/types';
import { extractMetrics, isScorable, type ParticipantMetrics, type Role } from './metrics';

/**
 * Per-game performance scoring.
 *
 * The central idea: score each player against the other nine players *in their own
 * match*, with extra weight on their direct role opponent. Every game ships with a
 * control group at exactly the right MMR, so the score is self-calibrating and needs
 * no external rank-cohort dataset.
 *
 * When a large dataset exists later, only `baselineFor` changes — swap "this lobby"
 * for "this rank cohort" and every downstream number keeps working.
 */

export type ScoredMetric =
  | 'killParticipation'
  | 'deathShare'
  | 'damageShare'
  | 'goldShare'
  | 'damageTakenShare'
  | 'objectiveDamageShare'
  | 'csPerMin'
  | 'visionPerMin';

type Weights = Record<ScoredMetric, number>;

/**
 * Role weights. Negative means lower is better. Magnitudes sum to ~1 per role so
 * the composite is comparable across roles; they're normalised again at use anyway.
 *
 * These are opinionated starting values — tune them once there's real data and the
 * group starts arguing about the leaderboard, which is the point.
 */
export const ROLE_WEIGHTS: Record<Role, Weights> = {
  TOP: {
    killParticipation: 0.18,
    deathShare: -0.15,
    damageShare: 0.18,
    goldShare: 0.08,
    damageTakenShare: 0.12,
    objectiveDamageShare: 0.06,
    csPerMin: 0.18,
    visionPerMin: 0.05,
  },
  JUNGLE: {
    killParticipation: 0.24,
    deathShare: -0.15,
    damageShare: 0.12,
    goldShare: 0.06,
    damageTakenShare: 0.07,
    objectiveDamageShare: 0.16,
    csPerMin: 0.1,
    visionPerMin: 0.1,
  },
  MIDDLE: {
    killParticipation: 0.2,
    deathShare: -0.15,
    damageShare: 0.24,
    goldShare: 0.1,
    damageTakenShare: 0.02,
    objectiveDamageShare: 0.06,
    csPerMin: 0.18,
    visionPerMin: 0.05,
  },
  BOTTOM: {
    killParticipation: 0.17,
    deathShare: -0.15,
    damageShare: 0.26,
    goldShare: 0.12,
    damageTakenShare: 0.01,
    objectiveDamageShare: 0.05,
    csPerMin: 0.2,
    visionPerMin: 0.04,
  },
  UTILITY: {
    killParticipation: 0.24,
    deathShare: -0.14,
    damageShare: 0.08,
    goldShare: 0.02,
    damageTakenShare: 0.09,
    objectiveDamageShare: 0.04,
    csPerMin: 0.01,
    visionPerMin: 0.28,
  },
};

const SCORED_METRICS = Object.keys(ROLE_WEIGHTS.TOP) as ScoredMetric[];

/** How much the direct lane opponent matters on top of the whole-lobby comparison. */
const LANE_WEIGHT = 0.3;
/** Controls how quickly the composite saturates towards 0 and 100. */
const SQUASH = 1.6;
/** Winning matters, but a 25/3 loss should still beat a 2/6 win. */
const WIN_BONUS = 6;

export interface PerformanceScore extends ParticipantMetrics {
  /** 0-100. */
  score: number;
  /** Pre-squash composite, useful for debugging and for lane-delta display. */
  raw: number;
  /** Same composite for the direct role opponent, when one exists. */
  opponentRaw: number | null;
  /** Per-metric z-scores against the lobby, for the "why" breakdown in the UI. */
  contributions: Record<ScoredMetric, number>;
}

interface Baseline {
  mean: number;
  stdDev: number;
}

/** Lobby baseline: mean and spread of a metric across all ten players. */
function baselineFor(rows: ParticipantMetrics[], metric: ScoredMetric): Baseline {
  const values = rows.map((r) => r[metric]);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return { mean, stdDev: Math.sqrt(variance) };
}

function zScore(value: number, baseline: Baseline): number {
  if (baseline.stdDev < 1e-9) return 0;
  // Clamp so one absurd outlier can't dominate the composite.
  return Math.max(-3, Math.min(3, (value - baseline.mean) / baseline.stdDev));
}

/**
 * Scores every participant in a match. Returns an empty array for remakes and
 * early surrenders, which carry no signal.
 */
export function scoreMatch(match: Match): PerformanceScore[] {
  if (!isScorable(match)) return [];

  const rows = extractMetrics(match);
  if (rows.length < 2) return [];

  const baselines = new Map<ScoredMetric, Baseline>();
  for (const metric of SCORED_METRICS) {
    baselines.set(metric, baselineFor(rows, metric));
  }

  const composites = rows.map((row) => {
    const weights = ROLE_WEIGHTS[row.role];
    const contributions = {} as Record<ScoredMetric, number>;
    let composite = 0;
    let weightSum = 0;

    for (const metric of SCORED_METRICS) {
      const z = zScore(row[metric], baselines.get(metric)!);
      contributions[metric] = z;
      composite += weights[metric] * z;
      weightSum += Math.abs(weights[metric]);
    }

    return { row, contributions, raw: weightSum > 0 ? composite / weightSum : 0 };
  });

  return composites.map(({ row, contributions, raw }, index) => {
    const opponent = composites.find(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.row.teamId !== row.teamId &&
        other.row.role === row.role,
    );
    const opponentRaw = opponent?.raw ?? null;

    // Beating your direct counterpart counts for more than lobby-wide averages.
    const laneDelta = opponentRaw === null ? 0 : raw - opponentRaw;
    const adjusted = raw + LANE_WEIGHT * laneDelta;

    const squashed = 50 + 50 * Math.tanh(adjusted / SQUASH);
    const score = clamp(squashed + (row.win ? WIN_BONUS : -WIN_BONUS), 0, 100);

    return { ...row, score, raw: adjusted, opponentRaw, contributions };
  });
}

/** Scores only the tracked players in a match, but using the full lobby as baseline. */
export function scoreMatchForPuuids(
  match: Match,
  puuids: Iterable<string>,
): PerformanceScore[] {
  const wanted = new Set(puuids);
  return scoreMatch(match).filter((row) => wanted.has(row.puuid));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Human-readable labels for the score breakdown UI. */
export const METRIC_LABELS: Record<ScoredMetric, string> = {
  killParticipation: 'Kill participation',
  deathShare: 'Deaths (share of team)',
  damageShare: 'Damage share',
  goldShare: 'Gold share',
  damageTakenShare: 'Damage taken',
  objectiveDamageShare: 'Objective damage',
  csPerMin: 'CS per minute',
  visionPerMin: 'Vision per minute',
};
