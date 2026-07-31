import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/db';
import { knownPlayers } from '@/db/schema';
import type { Match } from './riot/types';
import { isPlatform, parseRiotId, type Platform } from './riot/routing';

/**
 * The searchable player index.
 *
 * Riot exposes no way to look somebody up by partial name, so suggestions come
 * from players we've already crossed paths with. The index grows on its own as
 * matches are ingested — every game adds up to ten more people.
 */

export const SUGGESTION_LIMIT = 8;
/** Below this, a prefix query matches half of EUW and helps nobody. */
const MIN_QUERY_LENGTH = 2;

export interface PlayerSuggestion {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  gamesSeen: number;
}

/** Records everybody in a match. Safe to call repeatedly for the same match. */
export async function indexMatchParticipants(match: Match): Promise<number> {
  const platformId = match.info.platformId.toLowerCase();
  const platform: Platform = isPlatform(platformId) ? platformId : 'euw1';

  const rows = match.info.participants
    .filter((p) => p.riotIdGameName && p.riotIdTagline)
    .map((p) => ({
      puuid: p.puuid,
      gameName: p.riotIdGameName!,
      tagLine: p.riotIdTagline!,
      platform,
      lastSeenAt: new Date(match.info.gameStartTimestamp),
    }));

  if (rows.length === 0) return 0;

  await db
    .insert(knownPlayers)
    .values(rows)
    .onConflictDoUpdate({
      target: knownPlayers.puuid,
      set: {
        // Riot IDs change; the newest sighting wins.
        gameName: sql`excluded.game_name`,
        tagLine: sql`excluded.tag_line`,
        gamesSeen: sql`${knownPlayers.gamesSeen} + 1`,
        lastSeenAt: sql`greatest(${knownPlayers.lastSeenAt}, excluded.last_seen_at)`,
      },
    });

  return rows.length;
}

export interface SuggestionResult {
  players: PlayerSuggestion[];
  /** True when nothing matched in the chosen region and these are from elsewhere. */
  fromOtherRegions: boolean;
}

/**
 * Prefix search. Accepts a bare name ("anvil") or a full Riot ID
 * ("anvil#DEVIL"), in which case the tag narrows it too.
 *
 * Results are confined to the selected region, because offering a Japanese
 * player while the dropdown says EUW is just confusing. The exception is when
 * the region has no match at all — a friend who plays on another server should
 * still be findable, so long as the results say plainly where they are.
 */
export async function suggestPlayers(
  query: string,
  platform?: string,
): Promise<SuggestionResult> {
  const empty: SuggestionResult = { players: [], fromOtherRegions: false };
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return empty;

  let namePart = trimmed;
  let tagPart: string | null = null;

  if (trimmed.includes('#')) {
    try {
      const parsed = parseRiotId(trimmed);
      namePart = parsed.gameName;
      tagPart = parsed.tagLine;
    } catch {
      // "anvil#" — treat everything before the hash as the name.
      namePart = trimmed.slice(0, trimmed.indexOf('#'));
    }
  }

  if (namePart.length < MIN_QUERY_LENGTH) return empty;

  // Escape the LIKE wildcards so a name containing % or _ can't broaden the query.
  const escaped = namePart.replace(/[\\%_]/g, (c) => `\\${c}`);

  // Prefix only: typing "anvil" should offer anvil and anvilito, never
  // theanvil. Matching mid-name turns a short query into noise.
  const nameMatch = tagPart
    ? sql`${knownPlayers.gameName} ilike ${escaped + '%'} and ${knownPlayers.tagLine} ilike ${tagPart + '%'}`
    : ilike(knownPlayers.gameName, `${escaped}%`);

  const run = (restrictToPlatform: boolean) =>
    db
      .select({
        puuid: knownPlayers.puuid,
        gameName: knownPlayers.gameName,
        tagLine: knownPlayers.tagLine,
        platform: knownPlayers.platform,
        gamesSeen: knownPlayers.gamesSeen,
      })
      .from(knownPlayers)
      .where(
        restrictToPlatform && platform
          ? and(nameMatch, eq(knownPlayers.platform, platform))
          : nameMatch,
      )
      // An exact name wins outright, then whoever we have seen most.
      .orderBy(
        sql`case when lower(${knownPlayers.gameName}) = lower(${namePart}) then 0 else 1 end`,
        desc(knownPlayers.gamesSeen),
      )
      .limit(SUGGESTION_LIMIT);

  const inRegion = await run(true);
  if (inRegion.length > 0 || !platform) {
    return { players: inRegion, fromOtherRegions: false };
  }

  // Nothing here, but they might be on another server — a group can span regions.
  const elsewhere = await run(false);
  return { players: elsewhere, fromOtherRegions: elsewhere.length > 0 };
}

export async function indexSize(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(knownPlayers);
  return row?.n ?? 0;
}
