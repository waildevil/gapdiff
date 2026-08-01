/**
 * Posts group news to Discord.
 *
 *   npx tsx src/scripts/post-digest.ts --dry-run     render, print, send nothing
 *   npx tsx src/scripts/post-digest.ts               daily digest, one day back
 *   npx tsx src/scripts/post-digest.ts --monthly     last month's final results
 *   npx tsx src/scripts/post-digest.ts --group=slug  limit to one board
 *
 * Silence is the default outcome. A group where nothing moved posts nothing,
 * because a channel that gets an identical message every evening is a channel
 * everybody mutes.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, runScript } from '@/db';
import { groups } from '@/db/schema';
import { digestPayload, monthlyPayload, postToDiscord } from '@/lib/discord';
import { getGroupStandings } from '@/lib/leaderboard';
import { getGroupMovement } from '@/lib/movement';
import { currentPeriodIndex, periodWindow } from '@/lib/titles';

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const monthly = argv.includes('--monthly');
  const only = argv.find((a) => a.startsWith('--group='))?.split('=')[1];
  const daysArg = argv.find((a) => a.startsWith('--days='));
  const days = daysArg ? Number.parseInt(daysArg.split('=')[1] ?? '', 10) : 1;

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook && !dryRun) {
    throw new Error('DISCORD_WEBHOOK_URL is not set. Use --dry-run to render without posting.');
  }

  const boards = only
    ? await db.select({ slug: groups.slug }).from(groups).where(eq(groups.slug, only))
    : await db.select({ slug: groups.slug }).from(groups);

  if (boards.length === 0) {
    console.log(only ? `No group "${only}".` : 'No groups.');
    return;
  }

  // The month that just ended, which is the only one whose titles are settled.
  const previousIndex = currentPeriodIndex() - 1;
  const previous = periodWindow(previousIndex);

  let posted = 0;

  for (const { slug } of boards) {
    const payload = monthly
      ? await (async () => {
          const standings = await getGroupStandings(slug, previousIndex);
          return standings ? monthlyPayload(standings, previous.label) : null;
        })()
      : await (async () => {
          const movement = await getGroupMovement(slug, days);
          return movement ? digestPayload(movement) : null;
        })();

    if (!payload) {
      console.log(`  ${slug}: nothing to say`);
      continue;
    }

    if (dryRun) {
      console.log(`\n--- ${slug} ---`);
      console.log(payload.embeds[0]!.title);
      console.log(payload.embeds[0]!.description);
      if (payload.embeds[0]!.footer) console.log(`(${payload.embeds[0]!.footer.text})`);
      continue;
    }

    await postToDiscord(webhook!, payload);
    posted++;
    console.log(`  ${slug}: posted`);
  }

  if (!dryRun) console.log(`\nDone. ${posted} message(s) posted.`);
}

void runScript(main);
