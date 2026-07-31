import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, notInArray } from 'drizzle-orm';
import { db, runScript } from '@/db';
import { accounts, trackedAccounts, groups, syncState } from '@/db/schema';
import { RiotClient } from '@/lib/riot/client';
import { parsePlatform, parseRiotId, regionForPlatform } from '@/lib/riot/routing';

/**
 * Resolves every Riot ID in config/group.json to a PUUID and creates the group.
 * Safe to re-run: members are upserted, so adding a friend means adding a line
 * to the config and running this again.
 *
 *   npm run seed
 */

interface GroupConfig {
  slug: string;
  name: string;
  platform: string;
  members: { riotId: string; nickname?: string }[];
}

async function loadConfig(): Promise<GroupConfig> {
  const file = path.join(process.cwd(), 'config', 'group.json');
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw) as GroupConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        'config/group.json not found. Copy config/group.example.json to config/group.json and fill in your friends.',
      );
    }
    throw error;
  }
}

async function main() {
  const config = await loadConfig();
  const platform = parsePlatform(config.platform);
  const region = regionForPlatform(platform);
  const riot = new RiotClient({ apiKey: process.env.RIOT_API_KEY ?? '' });

  console.log(`Seeding "${config.name}" on ${platform} (${region})\n`);

  const [group] = await db
    .insert(groups)
    .values({ slug: config.slug, name: config.name, isPrivate: true })
    .onConflictDoUpdate({ target: groups.slug, set: { name: config.name } })
    .returning();

  if (!group) throw new Error('Failed to create the group row.');

  let resolved = 0;
  const resolvedPuuids: string[] = [];

  for (const member of config.members) {
    const { gameName, tagLine } = parseRiotId(member.riotId);

    try {
      const { account, summoner } = await riot.resolveRiotId(platform, gameName, tagLine);

      await db
        .insert(accounts)
        .values({
          puuid: account.puuid,
          gameName: account.gameName,
          tagLine: account.tagLine,
          platform,
          summonerId: summoner.id ?? null,
          profileIconId: summoner.profileIconId,
          summonerLevel: summoner.summonerLevel,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: accounts.puuid,
          set: {
            gameName: account.gameName,
            tagLine: account.tagLine,
            summonerId: summoner.id ?? null,
            profileIconId: summoner.profileIconId,
            summonerLevel: summoner.summonerLevel,
            updatedAt: new Date(),
          },
        });

      // Upsert rather than ignore, so editing or removing a nickname in the
      // config actually takes effect on a re-run.
      await db
        .insert(trackedAccounts)
        .values({
          groupId: group.id,
          puuid: account.puuid,
          nickname: member.nickname ?? null,
        })
        .onConflictDoUpdate({
          target: [trackedAccounts.groupId, trackedAccounts.puuid],
          set: { nickname: member.nickname ?? null },
        });

      await db.insert(syncState).values({ puuid: account.puuid }).onConflictDoNothing();

      console.log(
        `  ok   ${account.gameName}#${account.tagLine}  level ${summoner.summonerLevel}`,
      );
      resolved++;
      resolvedPuuids.push(account.puuid);
    } catch (error) {
      // One bad Riot ID shouldn't abort the whole seed.
      console.error(`  FAIL ${member.riotId}: ${(error as Error).message}`);
    }
  }

  // The config is the source of truth: anybody no longer listed leaves the
  // group. Their account and match rows stay, so the games they played in are
  // still available as lobby context for everyone else.
  const keep = resolvedPuuids;
  const removed = await db
    .delete(trackedAccounts)
    .where(
      keep.length > 0
        ? and(eq(trackedAccounts.groupId, group.id), notInArray(trackedAccounts.puuid, keep))
        : eq(trackedAccounts.groupId, group.id),
    )
    .returning({ puuid: trackedAccounts.puuid });

  for (const row of removed) {
    console.log(`  out  ${row.puuid.slice(0, 12)}… removed from the group`);
  }

  console.log(`\nDone. ${resolved}/${config.members.length} accounts resolved.`);
  console.log('Next: npm run ingest');
}

void runScript(main);
