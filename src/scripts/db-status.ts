import 'dotenv/config';
import { desc, sql } from 'drizzle-orm';
import { db, PGLITE_DIR, runScript, usingPglite } from '@/db';
import { accounts, trackedAccounts, groups, matchParticipants, matches } from '@/db/schema';
import { getGroupStandings } from '@/lib/leaderboard';
import { currentPeriodIndex, MIN_GAMES_FOR_TITLE } from '@/lib/titles';

/**
 * What's actually in the database right now.
 *
 *   npm run db:status
 */
async function main() {
  console.log(
    usingPglite ? `Local PGlite at ${PGLITE_DIR}\n` : 'Hosted Postgres via DATABASE_URL\n',
  );

  const [groupCount] = await db.select({ n: sql<number>`count(*)::int` }).from(groups);
  const [accountCount] = await db.select({ n: sql<number>`count(*)::int` }).from(accounts);
  const [memberCount] = await db.select({ n: sql<number>`count(*)::int` }).from(trackedAccounts);
  const [matchCount] = await db.select({ n: sql<number>`count(*)::int` }).from(matches);
  const [participantCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(matchParticipants);

  console.log(`groups              ${groupCount?.n ?? 0}`);
  console.log(`accounts            ${accountCount?.n ?? 0}`);
  console.log(`group members       ${memberCount?.n ?? 0}`);
  console.log(`matches             ${matchCount?.n ?? 0}`);
  console.log(`match participants  ${participantCount?.n ?? 0}`);

  const [newest] = await db
    .select({ id: matches.matchId, at: matches.gameCreation })
    .from(matches)
    .orderBy(desc(matches.gameCreation))
    .limit(1);
  if (newest) {
    console.log(`newest match        ${newest.id} (${newest.at.toISOString().slice(0, 10)})`);
  }

  const all = await db.select({ slug: groups.slug }).from(groups);
  const latest = currentPeriodIndex();

  for (const group of all) {
    const standings = await getGroupStandings(group.slug);
    if (!standings) continue;

    console.log(`\n${standings.group.name} (/group/${group.slug})`);
    for (const entry of standings.entries) {
      const rating = entry.rating;
      console.log(
        `  ${String(entry.position).padStart(2)}. ${entry.player.gameName.padEnd(16)} ` +
          `gap ${rating.gapScore.toFixed(1).padStart(5)}  ` +
          `rank ${(rating.rankScore?.toFixed(0) ?? ' --').padStart(3)}  ` +
          `perf ${rating.performanceScore.toFixed(0).padStart(3)}  ` +
          `cons ${rating.consistencyScore.toFixed(0).padStart(3)}  ` +
          `${rating.wins}W ${rating.losses}L over ${rating.games} scored`,
      );
    }

    console.log(`\n  Titles by month (min ${MIN_GAMES_FOR_TITLE} games):`);
    for (let index = 0; index <= latest; index++) {
      const monthly = await getGroupStandings(group.slug, index);
      if (!monthly) continue;
      const period = monthly.period;
      console.log(
        `\n   ${period.label}  ${period.start.toISOString().slice(0, 10)} → ` +
          `${new Date(period.end.getTime() - 1).toISOString().slice(0, 10)}` +
          `${period.isCurrent ? '  (in progress)' : ''}  · ${period.games} games`,
      );
      for (const entry of monthly.entries) {
        const held = entry.player.titles.map((t) => t.label).join(', ');
        console.log(
          `     ${entry.player.gameName.padEnd(14)} ` +
            `${String(entry.player.windowGames).padStart(3)} games  ` +
            (held ? held : entry.player.windowGames >= MIN_GAMES_FOR_TITLE ? '—' : '(ineligible)'),
        );
      }
    }
  }
}

void runScript(main);
