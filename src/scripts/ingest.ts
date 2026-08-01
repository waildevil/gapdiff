import 'dotenv/config';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
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
import { indexMatchParticipants } from '@/lib/playerIndex';
import { rankPoints } from '@/lib/rating/rating';
import { currentPeriodIndex, periodWindow } from '@/lib/titles';

/**
 * Pulls new matches for tracked accounts and scores them.
 *
 *   npm run ingest                      everyone, only what's new since last time
 *   npm run ingest -- --player anvil    one account, so adding somebody is quick
 *   npm run ingest -- --backfill        full history window, for a new account
 *   npm run ingest -- --days=90         explicit window, implies --backfill
 *
 * Incremental by default. An account that has already been backfilled is only
 * asked for matches since its last sync, which is usually a single page rather
 * than four — the expensive part is per-match fetches, and a match is never
 * fetched twice.
 */

/** Riot caps match-id pages at 100. */
const PAGE_SIZE = 100;
/** Re-check a little before the last sync, in case a game landed mid-run. */
const OVERLAP_MS = 60 * 60 * 1000;

interface Options {
  days: number | null;
  backfill: boolean;
  player: string | null;
}

function parseOptions(): Options {
  const argv = process.argv.slice(2);
  const daysArg = argv.find((a) => a.startsWith('--days='));
  const parsedDays = daysArg ? Number.parseInt(daysArg.split('=')[1] ?? '', 10) : NaN;
  const playerArg = argv.find((a) => a.startsWith('--player='));

  return {
    days: Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : null,
    // An explicit window is a backfill request by definition.
    backfill: argv.includes('--backfill') || Number.isFinite(parsedDays),
    player: playerArg ? (playerArg.split('=')[1] ?? null) : null,
  };
}

/**
 * The default window is the current month, because the standings are scored per
 * month — anything older only matters if somebody browses back to it, and that
 * is what --backfill is for.
 */
function defaultWindowStart(): Date {
  const monthStart = periodWindow(currentPeriodIndex()).start;
  return new Date(monthStart.getTime() - 2 * 24 * 60 * 60 * 1000);
}

async function storeMatch(match: Match, platform: string): Promise<void> {
  const scorable = isScorable(match);
  const duration = matchDurationSeconds(match);

  // Everyone in the lobby goes into the search index, tracked or not.
  await indexMatchParticipants(match);

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

interface SyncResult {
  added: number;
  seen: number;
  calls: number;
  mode: 'incremental' | 'backfill' | 'first run';
}

async function syncAccount(
  riot: RiotClient,
  account: {
    puuid: string;
    platform: string;
    gameName: string;
    tagLine: string;
    summonerId: string | null;
  },
  options: Options,
): Promise<SyncResult> {
  const platform = account.platform as Platform;
  const region = regionForPlatform(platform);
  const label = `${account.gameName}#${account.tagLine}`;

  const [state] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.puuid, account.puuid))
    .limit(1);

  const windowStart = options.days
    ? new Date(Date.now() - options.days * 24 * 60 * 60 * 1000)
    : defaultWindowStart();

  /*
   * The whole optimisation: an account that has already been backfilled only
   * needs what has happened since. Rescanning the full window every run cost
   * four wasted id pages per person to discover one new game.
   */
  let since: Date;
  let mode: SyncResult['mode'];

  if (options.backfill || !state?.backfillComplete) {
    since = windowStart;
    mode = state?.backfillComplete ? 'backfill' : 'first run';
  } else {
    const last = state.lastSyncedAt ?? windowStart;
    since = new Date(Math.max(last.getTime() - OVERLAP_MS, windowStart.getTime()));
    mode = 'incremental';
  }

  let calls = 0;

  // Ranked standing first — it's one call and it drives 40% of the Gap Score.
  const leagues = await riot.getLeagueEntries(
    platform,
    account.puuid,
    account.summonerId ?? undefined,
  );
  calls++;

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
  const startTime = Math.floor(since.getTime() / 1000);
  const collected: string[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const page = await riot.getMatchIds(region, account.puuid, {
      start,
      count: PAGE_SIZE,
      startTime,
    });
    calls++;
    collected.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  let added = 0;

  if (collected.length > 0) {
    // Matches shared with somebody already tracked are already here — a friend
    // group that duos a lot makes each extra member much cheaper than the first.
    const known = await db
      .select({ matchId: matches.matchId })
      .from(matches)
      .where(inArray(matches.matchId, collected));
    const knownIds = new Set(known.map((row) => row.matchId));

    for (const matchId of collected) {
      if (knownIds.has(matchId)) continue;
      const match = await riot.getMatch(region, matchId);
      calls++;
      if (!RATED_QUEUES.includes(match.info.queueId)) continue;
      await storeMatch(match, platform);
      added++;
    }
  }

  // Only ever widen the backfilled range. Computed here rather than in SQL:
  // postgres-js can't bind a JS Date inside a raw expression.
  const earliestCovered =
    state?.backfilledThrough && state.backfilledThrough < since
      ? state.backfilledThrough
      : since;

  await db
    .insert(syncState)
    .values({
      puuid: account.puuid,
      lastSyncedAt: new Date(),
      backfilledThrough: earliestCovered,
      backfillComplete: true,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: syncState.puuid,
      set: {
        lastSyncedAt: new Date(),
        backfilledThrough: earliestCovered,
        backfillComplete: true,
        lastError: null,
      },
    });

  console.log(
    `  ${label.padEnd(22)} ${String(added).padStart(3)} new of ${String(collected.length).padStart(3)} seen` +
      `  (${mode}, ${calls} API calls)`,
  );

  return { added, seen: collected.length, calls, mode };
}

async function main() {
  const options = parseOptions();
  const riot = new RiotClient({ apiKey: process.env.RIOT_API_KEY ?? '' });

  const where = options.player
    ? and(
        eq(trackedAccounts.puuid, accounts.puuid),
        or(
          sql`lower(${accounts.gameName}) = lower(${options.player})`,
          sql`lower(${accounts.gameName} || '#' || ${accounts.tagLine}) = lower(${options.player})`,
        ),
      )
    : eq(trackedAccounts.puuid, accounts.puuid);

  const tracked = await db
    .selectDistinct({
      puuid: accounts.puuid,
      platform: accounts.platform,
      gameName: accounts.gameName,
      tagLine: accounts.tagLine,
      summonerId: accounts.summonerId,
    })
    .from(accounts)
    .innerJoin(trackedAccounts, where);

  if (tracked.length === 0) {
    console.log(
      options.player
        ? `No tracked account matching "${options.player}".`
        : 'No tracked accounts. Run `npm run seed` first.',
    );
    return;
  }

  const window = options.days
    ? `last ${options.days} days`
    : `since ${defaultWindowStart().toISOString().slice(0, 10)}`;
  console.log(
    `Ingesting ${tracked.length} account(s), ${window}` +
      `${options.backfill ? ' (backfill)' : ''}\n`,
  );

  let total = 0;
  let calls = 0;

  for (const account of tracked) {
    try {
      const result = await syncAccount(riot, account, options);
      total += result.added;
      calls += result.calls;
    } catch (error) {
      const message = (error as Error).message;
      console.error(`  ${account.gameName}#${account.tagLine}: ${message}`);
      await db
        .insert(syncState)
        .values({ puuid: account.puuid, lastError: message })
        .onConflictDoUpdate({ target: syncState.puuid, set: { lastError: message } });
    }
  }

  console.log(`\nDone. ${total} new matches stored, ${calls} API calls.`);
}

void runScript(main);
