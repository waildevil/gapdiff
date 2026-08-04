import { TIERS, type Tier } from './rating/rating';

const TIER_VAR: Record<string, string> = {
  IRON: '--iron',
  BRONZE: '--bronze',
  SILVER: '--silver',
  GOLD: '--gold',
  PLATINUM: '--platinum',
  EMERALD: '--emerald',
  DIAMOND: '--diamond',
  MASTER: '--master',
  GRANDMASTER: '--grandmaster',
  CHALLENGER: '--challenger',
  UNRANKED: '--faint',
};

export function tierColor(tier: string): string {
  return `var(${TIER_VAR[tier.toUpperCase()] ?? '--faint'})`;
}

export interface RankLike {
  tier: string;
  division: string;
  leaguePoints: number;
}

export function tierLabel(rank: RankLike | null): string {
  if (!rank || rank.tier.toUpperCase() === 'UNRANKED') return 'Unranked';
  const upper = rank.tier.toUpperCase();
  const pretty = upper.charAt(0) + upper.slice(1).toLowerCase();
  if (TIERS.indexOf(upper as Tier) >= TIERS.indexOf('MASTER')) {
    return `${pretty} · ${rank.leaguePoints} LP`;
  }
  return `${pretty} ${rank.division} · ${rank.leaguePoints} LP`;
}

export const ROLE_LABEL: Record<string, string> = {
  TOP: 'TOP',
  JUNGLE: 'JG',
  MIDDLE: 'MID',
  BOTTOM: 'ADC',
  UTILITY: 'SUP',
};

/** Colour ramp for a 0-100 performance score. */
export function perfColor(score: number): string {
  if (score >= 75) return 'var(--good)';
  if (score >= 55) return 'var(--accent)';
  if (score >= 45) return 'var(--muted)';
  return 'var(--bad)';
}

export function perfBackground(score: number): string {
  if (score >= 75) return 'var(--good-soft)';
  if (score < 45) return 'var(--bad-soft)';
  return 'var(--surface-2)';
}

export function winRate(wins: number, losses: number): number {
  const total = wins + losses;
  return total > 0 ? Math.round((wins / total) * 100) : 0;
}

export function ordinal(position: number): string {
  const suffix = ['st', 'nd', 'rd'][position - 1] ?? 'th';
  return `${position}${suffix}`;
}

export function initials(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9' ]/g, '');
  const parts = clean.split(/[\s']+/).filter(Boolean);
  if (parts.length > 1 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}
