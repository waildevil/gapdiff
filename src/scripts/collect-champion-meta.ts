import 'dotenv/config';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db, runScript } from '@/db';
import {
  championMetaRollups,
  metaChampionBans,
  metaChampionObservations,
  metaCollectorSeeds,
  metaSampleMatches,
} from '@/db/schema';
import { RiotClient } from '@/lib/riot/client';
import { parsePlatform, parseRiotId, regionForPlatform, type Platform } from '@/lib/riot/routing';
import { isScorable, matchDurationSeconds } from '@/lib/rating/metrics';
import { scoreMatch } from '@/lib/rating/score';
import { QUEUE_IDS, type Match } from '@/lib/riot/types';

/**
 * Bounded public-meta collector.
 *
 * It starts from explicit EUW Riot IDs and gradually adds lobby participants
 * as future seeds. This is deliberately a sampled corpus, not a claim of
 * census-level coverage; the rollup retains its match count for an honest UI.
 *
 *   npm run meta:collect -- --seed="Name#TAG" --limit=25 --matches=20
 *   npm run meta:collect -- --limit=100 --matches=20
 */

const DEFAULT_SEED_LIMIT = 25;
const DEFAULT_MATCHES_PER_SEED = 20;
const DEFAULT_EXPANSION_CAP = 250;

interface Options {
  platform: Platform;
  seed: string | null;
  limit: number;
  matchesPerSeed: number;
  expansionCap: number;
}

function positiveOption(name: string, fallback: number, max: number): number {
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`));
  const parsed = raw ? Number.parseInt(raw.split('=')[1] ?? '', 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function parseOptions(): Options {
  const args = process.argv.slice(2);
  const platformArg = args.find((arg) => arg.startsWith('--platform='));
  const seedArg = args.find((arg) => arg.startsWith('--seed='));
  return {
    platform: parsePlatform(platformArg?.split('=')[1] ?? 'EUW'),
    seed: seedArg?.slice('--seed='.length) || null,
    limit: positiveOption('limit', DEFAULT_SEED_LIMIT, 500),
    matchesPerSeed: positiveOption('matches', DEFAULT_MATCHES_PER_SEED, 100),
    expansionCap: positiveOption('expand', DEFAULT_EXPANSION_CAP, 5_000),
  };
}

function patchFromVersion(version: string): string {
  const [major = 'unknown', minor = '0'] = version.split('.');
  return `${major}.${minor}`;
}

async function addSeed(riot: RiotClient, platform: Platform, riotId: string): Promise<void> {
  const { gameName, tagLine } = parseRiotId(riotId);
  const region = regionForPlatform(platform);
  const account = await riot.getAccountByRiotId(region, gameName, tagLine);
  await db
    .insert(metaCollectorSeeds)
    .values({ puuid: account.puuid, platform, region, source: 'manual' })
    .onConflictDoUpdate({
      target: metaCollectorSeeds.puuid,
      set: { platform, region, source: 'manual', lastError: null },
    });
  console.log(`Registered ${gameName}#${tagLine} as a ${platform.toUpperCase()} meta seed.`);
}

async function storeSample(match: Match, platform: Platform): Promise<boolean> {
  if (match.info.queueId !== QUEUE_IDS.RANKED_SOLO || !isScorable(match) || matchDurationSeconds(match) < 300) {
    return false;
  }

  const region = regionForPlatform(platform);
  const inserted = await db
    .insert(metaSampleMatches)
    .values({
      matchId: match.metadata.matchId,
      platform,
      region,
      queueId: match.info.queueId,
      patch: patchFromVersion(match.info.gameVersion),
      gameCreation: new Date(match.info.gameCreation),
      raw: match,
    })
    .onConflictDoNothing()
    .returning({ matchId: metaSampleMatches.matchId });

  if (inserted.length === 0) return false;

  const scored = scoreMatch(match);
  await db.insert(metaChampionObservations).values(
    scored.map((row) => ({
      matchId: match.metadata.matchId,
      participantId: row.participantId,
      championId: row.championId,
      championName: row.championName,
      role: row.role || 'UNKNOWN',
      win: row.win,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
    })),
  );

  const bans = (match.info.teams ?? []).flatMap((team) =>
    (team.bans ?? [])
      .filter((ban) => ban.championId > 0)
      .map((ban) => ({
        matchId: match.metadata.matchId,
        teamId: team.teamId,
        pickTurn: ban.pickTurn,
        championId: ban.championId,
      })),
  );
  if (bans.length > 0) await db.insert(metaChampionBans).values(bans).onConflictDoNothing();
  return true;
}

async function refreshRollups(): Promise<void> {
  await db.delete(championMetaRollups);
  await db.execute(sql`
    WITH role_totals AS (
      SELECT sm.patch, sm.region, sm.queue_id, o.role, count(*)::int AS role_games
      FROM meta_sample_matches sm
      JOIN meta_champion_observations o ON o.match_id = sm.match_id
      GROUP BY sm.patch, sm.region, sm.queue_id, o.role
    ), sample_totals AS (
      SELECT patch, region, queue_id, count(*)::int AS sampled_matches
      FROM meta_sample_matches
      GROUP BY patch, region, queue_id
    ), ban_totals AS (
      SELECT sm.patch, sm.region, sm.queue_id, b.champion_id, count(*)::int AS bans
      FROM meta_sample_matches sm
      JOIN meta_champion_bans b ON b.match_id = sm.match_id
      GROUP BY sm.patch, sm.region, sm.queue_id, b.champion_id
    )
    INSERT INTO champion_meta_rollups (
      patch, region, queue_id, role, champion_id, champion_name,
      games, wins, role_games, bans, sampled_matches, average_kda, refreshed_at
    )
    SELECT
      sm.patch, sm.region, sm.queue_id, o.role, o.champion_id, min(o.champion_name),
      count(*)::int,
      count(*) FILTER (WHERE o.win)::int,
      rt.role_games,
      coalesce(bt.bans, 0),
      st.sampled_matches,
      avg((o.kills + o.assists)::real / greatest(o.deaths, 1)),
      now()
    FROM meta_sample_matches sm
    JOIN meta_champion_observations o ON o.match_id = sm.match_id
    JOIN role_totals rt ON rt.patch = sm.patch AND rt.region = sm.region AND rt.queue_id = sm.queue_id AND rt.role = o.role
    JOIN sample_totals st ON st.patch = sm.patch AND st.region = sm.region AND st.queue_id = sm.queue_id
    LEFT JOIN ban_totals bt ON bt.patch = sm.patch AND bt.region = sm.region AND bt.queue_id = sm.queue_id AND bt.champion_id = o.champion_id
    GROUP BY sm.patch, sm.region, sm.queue_id, o.role, o.champion_id, rt.role_games, bt.bans, st.sampled_matches
  `);
}

async function main() {
  const options = parseOptions();
  const riot = new RiotClient({ apiKey: process.env.RIOT_API_KEY ?? '' });
  if (options.seed) await addSeed(riot, options.platform, options.seed);

  const seeds = await db
    .select()
    .from(metaCollectorSeeds)
    .where(eq(metaCollectorSeeds.platform, options.platform))
    .orderBy(asc(metaCollectorSeeds.lastCollectedAt))
    .limit(options.limit);

  if (seeds.length === 0) {
    throw new Error('No meta seeds yet. Start with --seed="RiotName#TAG".');
  }

  let fetched = 0;
  let stored = 0;
  let expanded = 0;
  for (const seed of seeds) {
    try {
      const ids = await riot.getMatchIds(regionForPlatform(options.platform), seed.puuid, {
        count: options.matchesPerSeed,
        queue: QUEUE_IDS.RANKED_SOLO,
      });
      const known = ids.length
        ? await db
            .select({ matchId: metaSampleMatches.matchId })
            .from(metaSampleMatches)
            .where(inArray(metaSampleMatches.matchId, ids))
        : [];
      const knownIds = new Set(known.map((row) => row.matchId));

      for (const id of ids) {
        if (knownIds.has(id)) continue;
        const match = await riot.getMatch(regionForPlatform(options.platform), id);
        fetched++;
        if (await storeSample(match, options.platform)) {
          stored++;
          const candidates = match.metadata.participants.slice(0, Math.max(0, options.expansionCap - expanded));
          if (candidates.length > 0) {
            await db
              .insert(metaCollectorSeeds)
              .values(candidates.map((puuid) => ({ puuid, platform: options.platform, region: seed.region, source: 'participant' })))
              .onConflictDoNothing();
            expanded += candidates.length;
          }
        }
      }
      await db.update(metaCollectorSeeds).set({ lastCollectedAt: new Date(), lastError: null }).where(eq(metaCollectorSeeds.puuid, seed.puuid));
      console.log(`Collected ${seed.puuid.slice(0, 8)}…: ${ids.length} IDs checked.`);
    } catch (error) {
      const message = (error as Error).message;
      await db.update(metaCollectorSeeds).set({ lastError: message }).where(eq(metaCollectorSeeds.puuid, seed.puuid));
      console.error(`Seed ${seed.puuid.slice(0, 8)}… failed: ${message}`);
    }
  }

  await refreshRollups();
  console.log(`Champion meta complete: ${stored} new ranked-solo matches from ${fetched} match fetches; ${expanded} participant leads added.`);
}

void runScript(main);
