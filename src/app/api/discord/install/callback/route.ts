import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/db';
import { groups } from '@/db/schema';
import { isOwner } from '@/lib/groups';

/**
 * Where the "Add to Discord" link comes back to. Discord's own screen picked
 * the server; this just reads `guild_id` off the query string and hands it to
 * the manage page as `?discordGuildId=`, which shows the channel picker.
 *
 * Nothing is persisted here — the guild id only carries through the redirect.
 * If the owner never finishes picking a channel, there is nothing left over
 * to clean up, and clicking "Add to Discord" again is cheap.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const guildId = url.searchParams.get('guild_id');
  const slug = url.searchParams.get('state');

  if (!slug) return NextResponse.redirect(new URL('/groups', request.url));

  const manage = new URL(`/groups/${slug}/manage`, request.url);

  const session = await auth();
  if (!session?.user?.id) {
    const signin = new URL('/signin', request.url);
    signin.searchParams.set('callbackUrl', manage.pathname);
    return NextResponse.redirect(signin);
  }

  const [group] = await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, slug)).limit(1);

  // Not their group, or Discord sent back something stale — either way, back
  // to a plain manage page rather than trusting a guild id that wasn't asked
  // for by this owner.
  if (!group || !(await isOwner(group.id, session.user.id))) {
    return NextResponse.redirect(manage);
  }

  if (!guildId) {
    manage.searchParams.set('discordError', 'declined');
    return NextResponse.redirect(manage);
  }

  manage.searchParams.set('discordGuildId', guildId);
  return NextResponse.redirect(manage);
}
