import 'dotenv/config';
import { RiotClient, RiotApiError } from '@/lib/riot/client';
import { parsePlatform, parseRiotId, regionForPlatform } from '@/lib/riot/routing';

/**
 * Proves the Riot key works and the routing is right.
 *
 *   npm run check-key
 *   npm run check-key -- "Name#TAG" euw1
 */

async function main() {
  const key = process.env.RIOT_API_KEY;
  if (!key || key.includes('xxxx')) {
    console.error('RIOT_API_KEY is missing or still the placeholder. Check gapdiff/.env');
    process.exitCode = 1;
    return;
  }
  console.log(`Key loaded: ${key.slice(0, 10)}...${key.slice(-4)}\n`);

  const riotIdArg = process.argv[2];
  const platform = parsePlatform(process.argv[3] ?? 'euw1');
  const region = regionForPlatform(platform);
  const client = new RiotClient({ apiKey: key });

  // No account needed — the cheapest way to tell a dead key from a bad name.
  const status = await fetch(
    `https://${platform}.api.riotgames.com/lol/status/v4/platform-data`,
    { headers: { 'X-Riot-Token': key } },
  );

  if (status.status === 401 || status.status === 403) {
    console.error(`Key rejected (HTTP ${status.status}). It has probably expired —`);
    console.error('development keys last 24 hours. Regenerate at developer.riotgames.com');
    process.exitCode = 1;
    return;
  }
  if (!status.ok) {
    console.error(`Unexpected status ${status.status}: ${await status.text()}`);
    process.exitCode = 1;
    return;
  }

  const platformData = (await status.json()) as { name: string; locales: string[] };
  console.log(`Key is valid. Connected to ${platformData.name} (${platform} / ${region}).`);

  if (!riotIdArg) {
    console.log('\nPass a Riot ID to look somebody up:');
    console.log('  npm run check-key -- "Name#TAG" euw1');
    return;
  }

  const { gameName, tagLine } = parseRiotId(riotIdArg);
  console.log(`\nResolving ${gameName}#${tagLine}...`);

  try {
    const { account, summoner, leagues } = await client.resolveRiotId(
      platform,
      gameName,
      tagLine,
    );
    console.log(`  puuid   ${account.puuid.slice(0, 20)}...`);
    console.log(`  level   ${summoner.summonerLevel}`);

    if (leagues.length === 0) {
      console.log('  ranked  unranked this season');
    } else {
      for (const entry of leagues) {
        console.log(
          `  ranked  ${entry.queueType}: ${entry.tier} ${entry.rank} ${entry.leaguePoints} LP (${entry.wins}W ${entry.losses}L)`,
        );
      }
    }

    const ids = await client.getMatchIds(region, account.puuid, { count: 5 });
    console.log(`  matches ${ids.length} recent: ${ids.join(', ') || 'none'}`);
  } catch (error) {
    if (error instanceof RiotApiError && error.isNotFound) {
      console.error(`  Not found. Check the spelling and that ${platform} is the right region.`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
