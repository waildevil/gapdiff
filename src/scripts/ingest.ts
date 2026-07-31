import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { db, runScript } from '@/db';
import {
  accounts,
  trackedAccounts,
  matchParticipants,
  matches,
  rankSnapshots,
  syncState,
} from '@/db/schema';
import { RiotClient } from '@/lib/riot/client';
import { regionForPlatform, type Platform } from '@/lib/riot/routing';
import { RATED_QUEUES, type Match } from '@/lib/riot/types';
import { isScorable, matchDurationSeconds } from '@/lib/rating/metrics';
import { scoreMatch } from '@/lib/rating/score';
import { rankPoints } from '@/lib/rating/rating';

/**
 * Pulls new matches for every tracked account and scores them.
 *
 *   npm run ingest              recent games only
 *   npm run ingest -- --days=90 reach further back
 *
 * Safe to re-run and safe to interrupt: matches already stored are skipped, and
 * sync state only advances after a successful pass for that account.
 */

const DEFAULT_DAYS = 30;
/** Riot caps match-id pages at 100. */
const PAGE_SIZE = 100;

function parseDays(): number {
  const arg = process.argv.find((a) => a.startsWith('--days='));
  const value = arg ? Number.parseInt(arg.split('=')[1] ?? '', 10) : NaN;
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DAYS;
}

async function storeMatch(match: Match, platform: string): Promise<void> {
  const scorable = isScorable(match);
  const duration = matchDurationSeconds(match);

  await db
    .insert(matches)
    .values({
      matchId: match.metadata.matchId,
      platform,
      queueId: match.info.queueId,
      gameMode: match.info.gameMode,
      gameVersion: match.info.gameVersion,
      gameCreation: new Date(match.info.gameCreation),
      durationSeconds: duration,
      scorable,
      raw: match,
    })
    .onConflictDoNothing();

  // Score every participant, not just tracked ones: the whole lobby is the
  // baseline, and it makes the match detail page complete for free.
  const scored = scoreMatch(match);
  if (scored.length === 0) return;

  await db
    .insert(matchParticipants)
    .values(
      scored.map((row) => ({
        matchId: match.metadata.matchId,
        puuid: row.puuid,
        participantId: row.participantId,
        teamId: row.teamId,
        win: row.win,
        championId: row.championId,
        championName: row.championName,
        role: row.role,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        killParticipation: row.killParticipation,
        deathShare: row.deathShare,
        damageShare: row.damageShare,
        goldShare: row.goldShare,
        damageTakenShare: row.damageTakenShare,
        objectiveDamageShare: row.objectiveDamageShare,
        csPerMin: row.csPerMin,
        visionPerMin: row.visionPerMin,
        visionScore: row.visionScore,
        wardsPlaced: row.wardsPlaced,
        controlWards: row.controlWards,
        soloKills: row.soloKills,
        performanceScore: row.score,
        performanceRaw: row.raw,
        opponentRaw: row.opponentRaw,
      })),
    )
    .onConflictDoNothing();
}

async function syncAccount(
  riot: RiotClient,
  account: { puuid: string; platform: string; gameName: string; tagLine: string; summonerId: string | null },
  since: number,
): Promise<{ added: number }> {
  const platform = account.platform as Platform;
  const region = regionForPlatform(platform);
  const label = `${account.gameName}#${account.tagLine}`;

  // Ranked standing first — it's one call and it drives 40% of the Gap Score.
  const leagues = await riot.getLeagueEntries(platform, account.puuid, account.summonerId ?? undefined);
  for (const entry of leagues) {
    if (!entry.tier) continue;
    await db.insert(rankSnapshots).values({
      puuid: account.puuid,
      queueType: entry.queueType,
      tier: entry.tier,
      division: entry.rank ?? '',
      leaguePoints: entry.leaguePoints,
      rankPoints: rankPoints(entry.tier, entry.rank ?? '', entry.leaguePoints),
      wins: entry.wins,
      losses: entry.losses,
    });
  }

  // Riot expects epoch *seconds* here. Milliseconds silently returns nothing.
  const startTime = Math.floor(since / 1000);
  const collected: string[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const page = await riot.getMatchIds(region, account.puuid, {
      start,
      count: PAGE_SIZE,
      startTime,
    });
    collected.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (collected.length === 0) {
    console.log(`  ${label}: no matches in window`);
    return { added: 0 };
  }

  const known = await db
    .select({ matchId: matches.matchId })
    .from(matches)
    .where(inArray(matches.matchId, collected));
  const knownIds = new Set(known.map((row) => row.matchId));
  const missing = collected.filter((id) => !knownIds.has(id));

  let added = 0;
  for (const matchId of missing) {
    const match = await riot.getMatch(region, matchId);
    if (!RATED_QUEUES.includes(match.info.queueId)) continue;
    await storeMatch(match, platform);
    added++;
  }

  await db
    .update(syncState)
    .set({ lastSyncedAt: new Date(), lastError: null })
    .where(eq(syncState.puuid, account.puuid));

  console.log(`  ${label}: ${added} new of ${collected.length} seen`);
  return { added };
}

async function main() {
  const days = parseDays();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const riot = new RiotClient({ apiKey: process.env.RIOT_API_KEY ?? '' });

  const tracked = await db
    .selectDistinct({
      puuid: accounts.puuid,
      platform: accounts.platform,
      gameName: accounts.gameName,
      tagLine: accounts.tagLine,
      summonerId: accounts.summonerId,
    })
    .from(accounts)
    .innerJoin(trackedAccounts, eq(trackedAccounts.puuid, accounts.puuid));

  if (tracked.length === 0) {
    console.log('No tracked accounts. Run `npm run seed` first.');
    return;
  }

  console.log(`Ingesting ${tracked.length} accounts, last ${days} days\n`);

  let total = 0;
  for (const account of tracked) {
    try {
      const { added } = await syncAccount(riot, account, since);
      total += added;
    } catch (error) {
      const message = (error as Error).message;
      console.error(`  ${account.gameName}#${account.tagLine}: ${message}`);
      await db
        .update(syncState)
        .set({ lastError: message })
        .where(eq(syncState.puuid, account.puuid));
    }
  }

  console.log(`\nDone. ${total} new matches stored.`);
}

void runScript(main);
