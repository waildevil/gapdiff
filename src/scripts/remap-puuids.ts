/**
 * Re-map tracked accounts onto the PUUIDs the current API key produces.
 *
 *   npx tsx src/scripts/remap-puuids.ts            report only, changes nothing
 *   npx tsx src/scripts/remap-puuids.ts --apply    perform the migration
 *
 * Riot encrypts PUUIDs per API key, so regenerating a key silently orphans a
 * database keyed on them: every stored row still joins to itself, but nothing
 * in it can be handed back to Riot. The symptom is 400 "Exception decrypting"
 * on every request and a live profile whose freshly-resolved PUUID matches no
 * stored history.
 *
 * The Riot ID is the only stable handle across that boundary, so each account
 * is re-resolved by gameName#tagLine and its PUUID rewritten everywhere.
 *
 * Only tracked accounts are re-mapped. The thousands of strangers in
 * known_players and match_participants keep their old PUUIDs: they are never
 * sent back to Riot, and lobby-mates are matched within a match by match_id.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, runScript } from '@/db';
import { getRiotClient } from '@/lib/riot/client';
import { regionForPlatform, type Platform } from '@/lib/riot/routing';

/** Every table holding a PUUID, in an order that keeps foreign keys satisfied. */
const TABLES = [
  'match_participants',
  'rank_snapshots',
  'sync_state',
  'account_claims',
  'tracked_accounts',
  'known_players',
] as const;

async function main() {
  const apply = process.argv.includes('--apply');
  const riot = getRiotClient();

  const result = await db.execute(sql`
    SELECT DISTINCT a.puuid, a.game_name, a.tag_line, a.platform
    FROM accounts a JOIN tracked_accounts t ON t.puuid = a.puuid
    ORDER BY a.game_name
  `);
  const accounts = (((result as { rows?: unknown[] }).rows ?? result) as {
    puuid: string;
    game_name: string;
    tag_line: string;
    platform: string;
  }[]);

  console.log(apply ? 'APPLYING migration\n' : 'DRY RUN — nothing will be written\n');

  for (const account of accounts) {
    const region = regionForPlatform(account.platform as Platform);
    let fresh: string;
    try {
      const resolved = await riot.getAccountByRiotId(
        region,
        account.game_name,
        account.tag_line,
      );
      fresh = resolved.puuid;
    } catch (error) {
      console.log(`  ${account.game_name}#${account.tag_line}: UNRESOLVABLE — ${String(error).slice(0, 80)}`);
      continue;
    }

    const label = `${account.game_name}#${account.tag_line}`;
    if (fresh === account.puuid) {
      console.log(`  ${label.padEnd(22)} already current, skipping`);
      continue;
    }

    // A collision would mean the new PUUID is already in use — bail rather than
    // merge two identities together.
    const clash = await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM accounts WHERE puuid = ${fresh}
    `);
    if ((((clash as { rows?: { n: number }[] }).rows ?? clash) as { n: number }[])[0]!.n > 0) {
      console.log(`  ${label.padEnd(22)} SKIPPED — target PUUID already exists`);
      continue;
    }

    const counts: string[] = [];
    for (const table of TABLES) {
      const c = await db.execute(
        sql`SELECT COUNT(*)::int AS n FROM ${sql.identifier(table)} WHERE puuid = ${account.puuid}`,
      );
      const n = (((c as { rows?: { n: number }[] }).rows ?? c) as { n: number }[])[0]!.n;
      if (n > 0) counts.push(`${table} ${n}`);
    }

    console.log(
      `  ${label.padEnd(22)} ${account.puuid.slice(0, 12)}… -> ${fresh.slice(0, 12)}…  [${counts.join(', ') || 'no rows'}]`,
    );

    if (!apply) continue;

    /*
     * The old and new rows have to coexist while the children are repointed —
     * deleting the old one first would cascade straight through rank_snapshots,
     * which is the data this migration exists to save. But accounts is unique
     * on (game_name, tag_line, platform), so two rows for the same player
     * collide.
     *
     * So the old row's name is parked under a sentinel for the duration. Only
     * game_name is touched because it is the one `text` column of the three;
     * tag_line and platform are varchar(8) with no room for a suffix.
     */
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE accounts SET game_name = game_name || '~migrating'
        WHERE puuid = ${account.puuid}
      `);

      // summoner_id is encrypted per key too, so the stored one is as dead as
      // the PUUID. Nulling it makes the client re-resolve rather than retry a
      // value that can only 400.
      await tx.execute(sql`
        INSERT INTO accounts (puuid, game_name, tag_line, platform, summoner_id,
                              profile_icon_id, summoner_level, created_at, updated_at)
        SELECT ${fresh}, ${account.game_name}, tag_line, platform, NULL,
               profile_icon_id, summoner_level, created_at, now()
        FROM accounts WHERE puuid = ${account.puuid}
      `);

      for (const table of TABLES) {
        await tx.execute(
          sql`UPDATE ${sql.identifier(table)} SET puuid = ${fresh} WHERE puuid = ${account.puuid}`,
        );
      }

      await tx.execute(sql`DELETE FROM accounts WHERE puuid = ${account.puuid}`);
    });
  }

  if (!apply) {
    console.log('\nRe-run with --apply to perform it.');
  }
}

void runScript(main);
