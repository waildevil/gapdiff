import type { Match, MatchParticipant, TeamPosition } from '../riot/types';

/**
 * Per-participant metrics, normalised so game length and team snowball don't
 * distort them. Everything is a share of the team total or a per-minute rate,
 * which makes a 20-minute stomp comparable to a 45-minute slugfest.
 */
export interface ParticipantMetrics {
  puuid: string;
  participantId: number;
  teamId: number;
  win: boolean;
  championId: number;
  championName: string;
  role: Role;

  kills: number;
  deaths: number;
  assists: number;
  kda: number;

  killParticipation: number;
  deathShare: number;
  damageShare: number;
  goldShare: number;
  damageTakenShare: number;
  objectiveDamageShare: number;
  csPerMin: number;
  visionPerMin: number;

  /** Kept for awards and display, not used in scoring. */
  visionScore: number;
  wardsPlaced: number;
  controlWards: number;
  soloKills: number;
  timeDeadShare: number;
  durationMinutes: number;
}

export type Role = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY';

export const ROLES: Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

/** Riot leaves teamPosition empty on remakes and some queues; fall back sensibly. */
export function normaliseRole(participant: MatchParticipant): Role {
  const candidates: TeamPosition[] = [
    participant.teamPosition,
    participant.individualPosition,
  ];
  for (const candidate of candidates) {
    if (candidate && ROLES.includes(candidate as Role)) return candidate as Role;
  }
  // Last resort: infer from lane/role strings.
  if (participant.lane === 'JUNGLE') return 'JUNGLE';
  if (participant.role === 'SUPPORT') return 'UTILITY';
  if (participant.lane === 'TOP') return 'TOP';
  if (participant.lane === 'MIDDLE') return 'MIDDLE';
  return 'BOTTOM';
}

const safeDiv = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;

/** Games too short to mean anything: remakes and early surrenders. */
export function isScorable(match: Match): boolean {
  const duration = matchDurationSeconds(match);
  if (duration < 330) return false;
  return !match.info.participants.some((p) => p.gameEndedInEarlySurrender);
}

/** Riot has returned duration in both seconds and milliseconds historically. */
export function matchDurationSeconds(match: Match): number {
  const { gameDuration, gameEndTimestamp, gameStartTimestamp } = match.info;
  if (gameEndTimestamp && gameStartTimestamp) {
    return Math.round((gameEndTimestamp - gameStartTimestamp) / 1000);
  }
  return gameDuration > 100_000 ? Math.round(gameDuration / 1000) : gameDuration;
}

interface TeamTotals {
  kills: number;
  deaths: number;
  damage: number;
  gold: number;
  damageTaken: number;
  objectiveDamage: number;
}

function teamTotals(participants: MatchParticipant[]): Map<number, TeamTotals> {
  const totals = new Map<number, TeamTotals>();
  for (const p of participants) {
    const current = totals.get(p.teamId) ?? {
      kills: 0,
      deaths: 0,
      damage: 0,
      gold: 0,
      damageTaken: 0,
      objectiveDamage: 0,
    };
    current.kills += p.kills;
    current.deaths += p.deaths;
    current.damage += p.totalDamageDealtToChampions;
    current.gold += p.goldEarned;
    current.damageTaken += p.totalDamageTaken;
    current.objectiveDamage += p.damageDealtToObjectives;
    totals.set(p.teamId, current);
  }
  return totals;
}

export function extractMetrics(match: Match): ParticipantMetrics[] {
  const seconds = matchDurationSeconds(match);
  const minutes = Math.max(1, seconds / 60);
  const totals = teamTotals(match.info.participants);

  return match.info.participants.map((p) => {
    const team = totals.get(p.teamId)!;
    const cs = p.totalMinionsKilled + p.neutralMinionsKilled;

    return {
      puuid: p.puuid,
      participantId: p.participantId,
      teamId: p.teamId,
      win: p.win,
      championId: p.championId,
      championName: p.championName,
      role: normaliseRole(p),

      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      kda: p.deaths === 0 ? p.kills + p.assists : (p.kills + p.assists) / p.deaths,

      killParticipation: safeDiv(p.kills + p.assists, team.kills),
      deathShare: safeDiv(p.deaths, team.deaths),
      damageShare: safeDiv(p.totalDamageDealtToChampions, team.damage),
      goldShare: safeDiv(p.goldEarned, team.gold),
      damageTakenShare: safeDiv(p.totalDamageTaken, team.damageTaken),
      objectiveDamageShare: safeDiv(p.damageDealtToObjectives, team.objectiveDamage),
      csPerMin: cs / minutes,
      visionPerMin: p.visionScore / minutes,

      visionScore: p.visionScore,
      wardsPlaced: p.wardsPlaced,
      controlWards: p.visionWardsBoughtInGame,
      soloKills: p.challenges?.soloKills ?? 0,
      timeDeadShare: safeDiv(p.totalTimeSpentDead, seconds),
      durationMinutes: minutes,
    };
  });
}
