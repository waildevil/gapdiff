/**
 * Riot uses two different routing schemes and mixing them up is the single most
 * common source of mystery 404s.
 *
 *   platform  (euw1, na1, kr, ...)      -> summoner, league, spectator, mastery
 *   regional  (europe, americas, ...)   -> account, match
 */

export const PLATFORMS = [
  'br1',
  'eun1',
  'euw1',
  'jp1',
  'kr',
  'la1',
  'la2',
  'me1',
  'na1',
  'oc1',
  'ru',
  'sg2',
  'tr1',
  'tw2',
  'vn2',
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const REGIONS = ['americas', 'europe', 'asia', 'sea'] as const;
export type Region = (typeof REGIONS)[number];

const PLATFORM_TO_REGION: Record<Platform, Region> = {
  br1: 'americas',
  la1: 'americas',
  la2: 'americas',
  na1: 'americas',
  eun1: 'europe',
  euw1: 'europe',
  me1: 'europe',
  ru: 'europe',
  tr1: 'europe',
  jp1: 'asia',
  kr: 'asia',
  tw2: 'asia',
  oc1: 'sea',
  sg2: 'sea',
  vn2: 'sea',
};

/** Human-facing labels, for region pickers. */
export const PLATFORM_LABELS: Record<Platform, string> = {
  br1: 'BR',
  eun1: 'EUNE',
  euw1: 'EUW',
  jp1: 'JP',
  kr: 'KR',
  la1: 'LAN',
  la2: 'LAS',
  me1: 'ME',
  na1: 'NA',
  oc1: 'OCE',
  ru: 'RU',
  sg2: 'SG',
  tr1: 'TR',
  tw2: 'TW',
  vn2: 'VN',
};

export function regionForPlatform(platform: Platform): Region {
  return PLATFORM_TO_REGION[platform];
}

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/** Accepts either a platform id (`euw1`) or a label (`EUW`, case-insensitive). */
export function parsePlatform(value: string): Platform {
  const lower = value.toLowerCase();
  if (isPlatform(lower)) return lower;

  const upper = value.toUpperCase();
  const match = (Object.keys(PLATFORM_LABELS) as Platform[]).find(
    (p) => PLATFORM_LABELS[p] === upper,
  );
  if (match) return match;

  throw new Error(
    `Unknown platform "${value}". Expected one of: ${PLATFORMS.join(', ')}`,
  );
}

export function platformHost(platform: Platform): string {
  return `https://${platform}.api.riotgames.com`;
}

export function regionHost(region: Region): string {
  return `https://${region}.api.riotgames.com`;
}

/** `Name#TAG` -> its parts. Tag is normalised to uppercase for storage. */
export function parseRiotId(riotId: string): { gameName: string; tagLine: string } {
  const hash = riotId.lastIndexOf('#');
  if (hash <= 0 || hash === riotId.length - 1) {
    throw new Error(`Invalid Riot ID "${riotId}". Expected the form "Name#TAG".`);
  }
  return {
    gameName: riotId.slice(0, hash).trim(),
    tagLine: riotId.slice(hash + 1).trim().toUpperCase(),
  };
}

export function formatRiotId(gameName: string, tagLine: string): string {
  return `${gameName}#${tagLine}`;
}
