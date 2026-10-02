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

/** Community Dragon exposes the current icon for a numeric rune/perk ID. */
export function runeIcon(runeId: number): string {
  const styles: Record<number, string> = { 8000: 'precision', 8100: 'domination', 8200: 'sorcery', 8300: 'inspiration', 8400: 'resolve' };
  const keystones: Record<number, [string, number]> = {
    8005: ['precision', 8000], 8008: ['precision', 8000], 8010: ['precision', 8000], 8021: ['precision', 8000],
    8112: ['domination', 8100], 8128: ['domination', 8100], 9923: ['domination', 8100],
    8214: ['sorcery', 8200], 8229: ['sorcery', 8200], 8230: ['sorcery', 8200],
    8437: ['resolve', 8400], 8439: ['resolve', 8400], 8465: ['resolve', 8400],
    8351: ['inspiration', 8300], 8360: ['inspiration', 8300], 8369: ['inspiration', 8300],
  };
  const keystone = keystones[runeId];
  if (keystone) return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/${keystone[0]}/p${keystone[1]}_s0_k${runeId}.jpg`;
  const style = styles[runeId];
  if (style) return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/${runeId === 8000 ? '7201' : runeId === 8100 ? '7200' : runeId === 8200 ? '7202' : runeId === 8300 ? '7203' : '7204'}_${style}.png`;
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/runesicon.png`;
}

export function statRuneIcon(runeId: number): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/statmods/${runeId}.png`;
}

let runeMapCache: { version: string; map: Map<number, string> } | null = null;

export async function runeAssetMap(version: string): Promise<Map<number, string>> {
  if (runeMapCache?.version === version) return runeMapCache.map;
  const map = new Map<number, string>();
  try {
    const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`, { next: { revalidate: 86400 } });
    if (response.ok) {
      const trees = (await response.json()) as Array<{ slots: Array<{ runes: Array<{ id: number; icon: string }> }> }>;
      for (const tree of trees) for (const slot of tree.slots) for (const rune of slot.runes) map.set(rune.id, `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`);
    }
  } catch { /* static fallback below keeps the page usable */ }
  runeMapCache = { version, map };
  return map;
}

/** Ranked emblems come from Community Dragon; Data Dragon doesn't carry them. */
export function rankEmblem(tier: string): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png`;
}

let championMapCache: { version: string; byId: Map<number, string> } | null = null;

/**
 * Spectator data only carries numeric championId, but the asset CDN is keyed
 * by champion name (`championIcon`) — Riot ships no id->name endpoint, so this
 * is the one live lookup against Data Dragon's full champion list.
 */
export async function championIdToName(version: string): Promise<Map<number, string>> {
  if (championMapCache && championMapCache.version === version) return championMapCache.byId;

  const byId = new Map<number, string>();
  try {
    const response = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
      { next: { revalidate: 3600 } },
    );
    if (response.ok) {
      const data = (await response.json()) as { data: Record<string, { key: string; id: string }> };
      for (const champion of Object.values(data.data)) {
        byId.set(Number(champion.key), champion.id);
      }
    }
  } catch {
    // Empty map falls back to a numeric label wherever it's used.
  }

  championMapCache = { version, byId };
  return byId;
}
