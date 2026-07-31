import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, runScript } from '@/db';
import { accounts, matchParticipants, matches } from '@/db/schema';
import { getRiotClient } from '@/lib/riot/client';
import { regionForPlatform, type Platform } from '@/lib/riot/routing';
import { RATED_QUEUES } from '@/lib/riot/types';
import { queueName } from '@/lib/profile';
import { currentPeriodIndex, MIN_GAMES_FOR_TITLE, periodWindow } from '@/lib/titles';

/**
 * Explains, week by week, exactly why a player's counted games differ from what
 * their match history shows. Asks Riot for every match in the window — no queue
 * filter — then says what happened to each one.
 *
 *   npm run audit -- GashSama
 */
async function main() {
  const wanted = (process.argv[2] ?? '').toLowerCase();
  if (!wanted) {
    console.error('Usage: npm run audit -- <gameName>');
    process.exitCode = 1;
    return;
  }

  const tracked = await db.select().from(accounts);
  const account = tracked.find((a) => a.gameName.toLowerCase() === wanted);
  if (!account) {
    console.error(`No tracked account matching "${process.argv[2]}".`);
    console.error(`Known: ${tracked.map((a) => a.gameName).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const riot = getRiotClient();
  const platform = account.platform as Platform;
  const region = regionForPlatform(platform);
  const latest = currentPeriodIndex();

  console.log(`${account.gameName}#${account.tagLine} — every match Riot has, by month\n`);

  for (let index = 0; index <= latest; index++) {
    const period = periodWindow(index);

    const ids: string[] = [];
    for (let start = 0; ; start += 100) {
      const page = await riot.getMatchIds(region, account.puuid, {
        start,
        count: 100,
        startTime: Math.floor(period.start.getTime() / 1000),
        endTime: Math.floor(period.end.getTime() / 1000),
      });
      ids.push(...page);
      if (page.length < 100) break;
    }

    const reasons = new Map<string, number>();
    let counted = 0;

    for (const id of ids) {
      const [stored] = await db
        .select({ scorable: matches.scorable, queueId: matches.queueId })
        .from(matches)
        .where(eq(matches.matchId, id))
        .limit(1);

      if (!stored) {
        // Not ingested at all: the only reason is the queue filter.
        const match = await riot.getMatch(region, id);
        const label = RATED_QUEUES.includes(match.info.queueId)
          ? 'not ingested (run npm run ingest)'
          : `${queueName(match.info.queueId)} — queue not counted`;
        reasons.set(label, (reasons.get(label) ?? 0) + 1);
        continue;
      }

      if (!stored.scorable) {
        reasons.set('remake / early surrender', (reasons.get('remake') ?? 0) + 1);
        continue;
      }

      const [participant] = await db
        .select({ puuid: matchParticipants.puuid })
        .from(matchParticipants)
        .where(eq(matchParticipants.matchId, id))
        .limit(1);

      if (!participant) {
        reasons.set('stored but unscored', (reasons.get('stored but unscored') ?? 0) + 1);
        continue;
      }

      counted++;
    }

    const eligible = counted >= MIN_GAMES_FOR_TITLE;
    console.log(
      `${period.label}  ${period.start.toISOString().slice(0, 10)} → ` +
        `${new Date(period.end.getTime() - 1).toISOString().slice(0, 10)}` +
        `${period.isCurrent ? '  (in progress)' : ''}`,
    );
    console.log(
      `  Riot has ${String(ids.length).padStart(3)} matches · ` +
        `${counted} counted · ${eligible ? 'ELIGIBLE' : `needs ${MIN_GAMES_FOR_TITLE}`}`,
    );
    for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${String(n).padStart(3)} excluded — ${reason}`);
    }
    console.log('');
  }
}

void runScript(main);
