/**
 * Data Dragon is Riot's free static-asset CDN: champion icons, profile icons,
 * items, runes. Versioned by patch, so the version has to be fetched once and
 * reused. Never self-host these.
 */

const VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';
const FALLBACK_VERSION = '15.1.1';

let cached: { version: string; fetchedAt: number } | null = null;
const CACHE_MS = 60 * 60 * 1000;

export async function latestVersion(): Promise<string> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.version;

  try {
    const response = await fetch(VERSIONS_URL, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error(`versions.json returned ${response.status}`);
    const versions = (await response.json()) as string[];
    const version = versions[0] ?? FALLBACK_VERSION;
    cached = { version, fetchedAt: Date.now() };
    return version;
  } catch {
    // A stale patch number still resolves valid image URLs for most assets.
    return FALLBACK_VERSION;
  }
}

export function championIcon(version: string, championName: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;
}

export function profileIcon(version: string, iconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
}

export function itemIcon(version: string, itemId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}

/**
 * Summoner spells are referenced by numeric id in match data but by name in the
 * asset CDN, and Riot ships no id->name endpoint. This covers everything that
 * appears on Summoner's Rift plus the ARAM and Arena extras.
 */
const SPELL_KEYS: Record<number, string> = {
  1: 'SummonerBoost',
  3: 'SummonerExhaust',
  4: 'SummonerFlash',
  6: 'SummonerHaste',
  7: 'SummonerHeal',
  11: 'SummonerSmite',
  12: 'SummonerTeleport',
  13: 'SummonerMana',
  14: 'SummonerDot',
  21: 'SummonerBarrier',
  30: 'SummonerPoroRecall',
  31: 'SummonerPoroThrow',
  32: 'SummonerSnowball',
  39: 'SummonerSnowURFSnowball_Mark',
  54: 'Summoner_UltBookPlaceholder',
  55: 'Summoner_UltBookSmitePlaceholder',
  2201: 'SummonerCherryFlee',
  2202: 'SummonerCherryHold',
};

export function spellIcon(version: string, spellId: number): string | null {
  const key = SPELL_KEYS[spellId];
  if (!key) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${key}.png`;
}

/** Ranked emblems come from Community Dragon; Data Dragon doesn't carry them. */
export function rankEmblem(tier: string): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${tier.toLowerCase()}.svg`;
}
