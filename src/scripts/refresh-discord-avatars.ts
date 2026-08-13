import 'dotenv/config';
import { runScript } from '@/db';
import { refreshDiscordProfiles } from '@/lib/discordProfiles';

/**
 * Resyncs every user's Discord name/avatar without needing them to sign back
 * in. Run ad hoc, or nightly via the ingest workflow.
 *
 *   npm run discord:refresh-avatars
 */

async function main() {
  if (!process.env.DISCORD_BOT_TOKEN) {
    throw new Error('DISCORD_BOT_TOKEN is missing. Check gapdiff/.env');
  }

  const summary = await refreshDiscordProfiles();
  console.log(`Checked ${summary.checked}, updated ${summary.updated}.`);

  for (const failure of summary.failed) {
    console.error(`  ${failure.discordId}: ${failure.error}`);
  }
  if (summary.failed.length > 0) {
    throw new Error(`${summary.failed.length} account(s) failed to resync — see above.`);
  }
}

void runScript(main);
