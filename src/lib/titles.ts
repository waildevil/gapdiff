/**
 * Earned titles.
 *
 * A title is contested: it belongs to whoever leads the group in that metric,
 * full stop. Nobody is handed one for being vaguely good at something — you
 * hold "Farm King" because your CS per minute is the highest in the group, and
 * you lose it the moment somebody passes you.
 *
 * Consequences of that rule, both intentional:
 *   - one player can hold several titles at once
 *   - a player who leads nothing holds none
 *
 * Where somebody holds more than one, the primary is whichever lead is most
 * dominant relative to the rest of the group.
 */

/**
 * Games needed inside the week before a player can contend for a title.
 *
 * Note this is a per-player, per-week bar: 10 games in seven days is roughly
 * one and a half a day, every day. Set TITLE_MIN_GAMES in .env to loosen it.
 */
export const MIN_GAMES_FOR_TITLE = (() => {
  const configured = Number.parseInt(process.env.TITLE_MIN_GAMES ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 10;
})();

/**
 * Riot does not publish split boundaries through the API, so this is a setting.
 * Point SEASON_START at the current split's start date in .env. Used for the
 * standings; titles run on the weekly window below.
 */
export function seasonStart(): Date {
  const configured = process.env.SEASON_START;
  if (configured) {
    const parsed = new Date(configured);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
}

/** Fallback when TITLE_WINDOW_START is unset or unparseable. */
const DEFAULT_TITLE_WINDOW_START = '2026-06-01';

/**
 * Period 0 begins here, snapped to the first of that month. Titles are
 * contested one calendar month at a time.
 *
 * The code says "period" rather than "month" so the cadence can change without
 * renaming everything that touches it — only the two functions below know that
 * a period is currently a month.
 */
export function titleAnchor(): Date {
  const configured = process.env.TITLE_WINDOW_START;
  const parsed = configured ? new Date(configured) : new Date(NaN);
  const base = Number.isNaN(parsed.getTime())
    ? new Date(`${DEFAULT_TITLE_WINDOW_START}T00:00:00Z`)
    : parsed;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
}

export interface PeriodWindow {
  index: number;
  start: Date;
  /** Exclusive: the first instant of the next period. */
  end: Date;
  isCurrent: boolean;
  /** "June 2026" */
  label: string;
}

/** Which period contains `now`. Never negative. */
export function currentPeriodIndex(now: Date = new Date()): number {
  const anchor = titleAnchor();
  const months =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth());
  return Math.max(0, months);
}

export function periodWindow(index: number, now: Date = new Date()): PeriodWindow {
  const anchor = titleAnchor();
  const clamped = Math.max(0, Math.min(index, currentPeriodIndex(now)));
  // Date.UTC normalises month overflow, so month 13 becomes January of the next year.
  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + clamped, 1));
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + clamped + 1, 1));

  return {
    index: clamped,
    start,
    end,
    isCurrent: clamped === currentPeriodIndex(now),
    label: start.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  };
}

/** Per-player aggregates over one week window. */
export interface TitleStats {
  puuid: string;
  games: number;
  csPerMin: number;
  visionPerMin: number;
  damageShare: number;
  damageTakenShare: number;
  goldShare: number;
  objectiveDamageShare: number;
  killParticipation: number;
  deathShare: number;
  /** Average deaths in a game — what "int merchant" should actually mean. */
  deathsPerGame: number;
  killsPerGame: number;
  assistsPerGame: number;
  /** (kills + assists) / deaths across the window, not an average of ratios. */
  kda: number;
  soloKillsPerGame: number;
  scoreStdDev: number;
  /** Games where somebody on the other team shared this player's role. */
  laneDuels: number;
  /** Share of those duels this player scored higher in, 0-1. */
  laneWinRate: number;
}

export interface TitleDefinition {
  id: string;
  label: string;
  /** Shown as the reason the holder has it. */
  describe: (stats: TitleStats) => string;
  value: (stats: TitleStats) => number;
  /** 'max' means the leader has the highest value. */
  direction: 'max' | 'min';
}

/**
 * More can be added here without touching anything else — each one only needs
 * a metric and a direction.
 */
export const TITLES: TitleDefinition[] = [
  {
    id: 'farm-king',
    label: 'Farm King',
    value: (s) => s.csPerMin,
    direction: 'max',
    describe: (s) => `${s.csPerMin.toFixed(1)} CS per minute over ${s.games} games`,
  },
  {
    id: 'int-merchant',
    label: 'Int Merchant',
    // Deaths per game, not share of team deaths: a player on a losing team
    // inherits a big share without dying any more than usual.
    value: (s) => s.deathsPerGame,
    direction: 'max',
    describe: (s) => `${s.deathsPerGame.toFixed(1)} deaths per game over ${s.games} games`,
  },
  {
    id: 'lane-bully',
    label: 'Lane Bully',
    value: (s) => s.laneWinRate,
    direction: 'max',
    describe: (s) =>
      `outscored their opposite number in ${Math.round(s.laneWinRate * 100)}% of ${s.laneDuels} duels`,
  },
  {
    id: 'ward-lord',
    label: 'Ward Lord',
    value: (s) => s.visionPerMin,
    direction: 'max',
    describe: (s) => `${s.visionPerMin.toFixed(1)} vision score per minute over ${s.games} games`,
  },
  {
    id: 'main-character',
    label: 'Main Character',
    value: (s) => s.damageShare,
    direction: 'max',
    describe: (s) =>
      `dealt ${Math.round(s.damageShare * 100)}% of the team's damage over ${s.games} games`,
  },
  {
    id: 'tank',
    label: 'Tank',
    value: (s) => s.damageTakenShare,
    direction: 'max',
    describe: (s) =>
      `soaked ${Math.round(s.damageTakenShare * 100)}% of the team's damage taken over ${s.games} games`,
  },
  {
    id: 'objective-menace',
    label: 'Objective Menace',
    value: (s) => s.objectiveDamageShare,
    direction: 'max',
    describe: (s) =>
      `did ${Math.round(s.objectiveDamageShare * 100)}% of the team's objective damage over ${s.games} games`,
  },
  {
    id: 'solo-killer',
    label: 'Solo Killer',
    value: (s) => s.soloKillsPerGame,
    direction: 'max',
    describe: (s) => `${s.soloKillsPerGame.toFixed(2)} solo kills per game over ${s.games} games`,
  },
  {
    id: 'team-player',
    label: 'Team Player',
    value: (s) => s.killParticipation,
    direction: 'max',
    describe: (s) =>
      `involved in ${Math.round(s.killParticipation * 100)}% of the team's kills over ${s.games} games`,
  },
  {
    id: 'mr-reliable',
    label: 'Mr. Reliable',
    value: (s) => s.scoreStdDev,
    direction: 'min',
    describe: (s) => `the steadiest performance in the group over ${s.games} games`,
  },
];

/**
 * Full-group rankings for the metrics worth arguing about. Every board lists
 * everybody, so you can see the gap to the holder rather than just who won.
 */
export interface StatBoard {
  id: string;
  label: string;
  metricLabel: string;
  value: (stats: TitleStats) => number;
  direction: 'max' | 'min';
  format: (value: number) => string;
  /** Set when leading this board also awards a title. */
  titleId?: string;
}

export const STAT_BOARDS: StatBoard[] = [
  {
    id: 'kda',
    label: 'Average KDA',
    metricLabel: '(K + A) / D',
    value: (s) => s.kda,
    direction: 'max',
    format: (v) => v.toFixed(2),
  },
  {
    id: 'cs',
    label: 'Farm King',
    metricLabel: 'CS per minute',
    value: (s) => s.csPerMin,
    direction: 'max',
    format: (v) => v.toFixed(1),
    titleId: 'farm-king',
  },
  {
    id: 'deaths',
    label: 'Int Merchant',
    metricLabel: 'deaths per game',
    value: (s) => s.deathsPerGame,
    direction: 'max',
    format: (v) => v.toFixed(1),
    titleId: 'int-merchant',
  },
  {
    id: 'lane',
    label: 'Lane Bully',
    metricLabel: 'duels won vs same role',
    value: (s) => s.laneWinRate,
    direction: 'max',
    format: (v) => `${Math.round(v * 100)}%`,
    titleId: 'lane-bully',
  },
  {
    id: 'vision',
    label: 'Ward Lord',
    metricLabel: 'vision score per minute',
    value: (s) => s.visionPerMin,
    direction: 'max',
    format: (v) => v.toFixed(1),
    titleId: 'ward-lord',
  },
  {
    id: 'damage-share',
    label: 'Main Character',
    metricLabel: 'share of team damage',
    value: (s) => s.damageShare,
    direction: 'max',
    format: (v) => `${Math.round(v * 100)}%`,
    titleId: 'main-character',
  },
  {
    id: 'damage-taken-share',
    label: 'Tank',
    metricLabel: 'share of damage taken',
    value: (s) => s.damageTakenShare,
    direction: 'max',
    format: (v) => `${Math.round(v * 100)}%`,
    titleId: 'tank',
  },
  {
    id: 'objective-share',
    label: 'Objective Menace',
    metricLabel: 'share of objective damage',
    value: (s) => s.objectiveDamageShare,
    direction: 'max',
    format: (v) => `${Math.round(v * 100)}%`,
    titleId: 'objective-menace',
  },
  {
    id: 'solo-kills',
    label: 'Solo Killer',
    metricLabel: 'solo kills per game',
    value: (s) => s.soloKillsPerGame,
    direction: 'max',
    format: (v) => v.toFixed(2),
    titleId: 'solo-killer',
  },
  {
    id: 'kill-participation',
    label: 'Team Player',
    metricLabel: 'kill participation',
    value: (s) => s.killParticipation,
    direction: 'max',
    format: (v) => `${Math.round(v * 100)}%`,
    titleId: 'team-player',
  },
  {
    id: 'consistency',
    label: 'Mr. Reliable',
    metricLabel: 'score std-dev, lower is steadier',
    value: (s) => s.scoreStdDev,
    direction: 'min',
    format: (v) => v.toFixed(1),
    titleId: 'mr-reliable',
  },
];

export interface HeldTitle {
  id: string;
  label: string;
  detail: string;
  /** How far clear of the group this lead is, in standard deviations. */
  dominance: number;
}

export interface TitleAward {
  puuid: string;
  titles: HeldTitle[];
  /** The most dominant of them, shown next to the name. */
  primary: HeldTitle | null;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Awards every title to its leader. Players below the games threshold are
 * excluded from contention entirely — a title should not be won on three games.
 */
export function assignTitles(stats: TitleStats[]): Map<string, TitleAward> {
  const awards = new Map<string, TitleAward>();
  for (const player of stats) {
    awards.set(player.puuid, { puuid: player.puuid, titles: [], primary: null });
  }

  const eligible = stats.filter((s) => s.games >= MIN_GAMES_FOR_TITLE);
  if (eligible.length === 0) return awards;

  for (const title of TITLES) {
    const values = eligible.map((s) => title.value(s));
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const spread = standardDeviation(values);

    let leader = eligible[0]!;
    for (const candidate of eligible) {
      const better =
        title.direction === 'max'
          ? title.value(candidate) > title.value(leader)
          : title.value(candidate) < title.value(leader);
      if (better) leader = candidate;
    }

    // A flat metric across the group means nobody meaningfully leads it.
    if (spread === 0) continue;

    const leaderValue = title.value(leader);
    const dominance =
      title.direction === 'max' ? (leaderValue - mean) / spread : (mean - leaderValue) / spread;

    awards.get(leader.puuid)?.titles.push({
      id: title.id,
      label: title.label,
      detail: title.describe(leader),
      dominance,
    });
  }

  for (const award of awards.values()) {
    award.titles.sort((a, b) => b.dominance - a.dominance);
    award.primary = award.titles[0] ?? null;
  }

  return awards;
}
