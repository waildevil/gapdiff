import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { authAccounts, users } from '@/db/schema';
import { discordImageFor } from './discord';
import { DiscordBotError, getUser } from './discordBot';

/**
 * Resyncs every signed-in user's name/avatar from Discord.
 *
 * `events.signIn` in auth.ts does the same update, but only for whoever
 * happens to log back in — someone who changed their Discord picture and
 * never signs in again stays stale forever. This walks every linked account
 * instead, using the bot's own token to read each person's public profile,
 * so it can run on a schedule (see the nightly ingest workflow) with nobody
 * needing to do anything.
 */
export interface RefreshSummary {
  checked: number;
  updated: number;
  failed: { discordId: string; error: string }[];
}

export async function refreshDiscordProfiles(): Promise<RefreshSummary> {
  const rows = await db
    .select({
      userId: authAccounts.userId,
      discordId: authAccounts.providerAccountId,
      name: users.name,
      image: users.image,
    })
    .from(authAccounts)
    .innerJoin(users, eq(users.id, authAccounts.userId))
    .where(eq(authAccounts.provider, 'discord'));

  const summary: RefreshSummary = { checked: rows.length, updated: 0, failed: [] };

  for (const row of rows) {
    let profile;
    try {
      profile = await getUser(row.discordId);
    } catch (error) {
      summary.failed.push({
        discordId: row.discordId,
        error: error instanceof DiscordBotError ? error.message : String(error),
      });
      continue;
    }

    const image = discordImageFor(profile);
    const name = profile.global_name ?? profile.username;
    if (image === row.image && name === row.name) continue;

    await db.update(users).set({ image, name }).where(eq(users.id, row.userId));
    summary.updated++;
  }

  return summary;
}
