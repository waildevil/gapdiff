import 'dotenv/config';
import { createReadStream, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { inArray } from 'drizzle-orm';
import { db, runScript } from '@/db';
import { metaChampionLoadouts, metaSampleMatches } from '@/db/schema';
import type { Match, MatchTimeline } from '@/lib/riot/types';
import { scoreMatch } from '@/lib/rating/score';

const ARCHIVE = 'archives/meta-sample-raw-2026-10-01T12-44-35.jsonl.gz';

function runeIds(perks: unknown): { primaryRuneId: number | null; secondaryRuneStyleId: number | null } {
  const styles = (perks as { styles?: Array<{ style?: number; selections?: Array<{ perk?: number }> }> } | undefined)?.styles ?? [];
  return { primaryRuneId: styles[0]?.selections?.[0]?.perk ?? null, secondaryRuneStyleId: styles[1]?.style ?? null };
}

function rowsFor(match: Match) {
  const scored = scoreMatch(match);
  const participants = new Map(match.info.participants.map((participant) => [participant.participantId, participant]));
  return scored.map((row) => {
    const participant = participants.get(row.participantId)!;
    const opponent = scored.find((candidate) => candidate.teamId !== row.teamId && candidate.role === row.role);
    const opponentParticipant = opponent ? participants.get(opponent.participantId) : undefined;
    const runes = runeIds(participant.perks);
    return {
      matchId: match.metadata.matchId, participantId: participant.participantId, championId: participant.championId,
      championName: participant.championName, role: row.role, teamId: participant.teamId, win: participant.win,
      opponentChampionId: opponentParticipant?.championId ?? null, opponentChampionName: opponentParticipant?.championName ?? null,
      spell1Id: participant.summoner1Id, spell2Id: participant.summoner2Id,
      itemIds: [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5].filter((item) => item > 0),
      primaryRuneId: runes.primaryRuneId, secondaryRuneStyleId: runes.secondaryRuneStyleId, skillOrder: [],
    };
  });
}

async function main() {
  if (!existsSync(ARCHIVE)) throw new Error(`Archive not found: ${ARCHIVE}`);
  const lines = createInterface({ input: createReadStream(ARCHIVE).pipe(createGunzip()), crlfDelay: Infinity });
  let records = 0;
  let restored = 0;
  let batch: Match[] = [];

  const flush = async () => {
    if (!batch.length) return;
    const ids = batch.map((match) => match.metadata.matchId);
    const known = await db.select({ matchId: metaSampleMatches.matchId }).from(metaSampleMatches).where(inArray(metaSampleMatches.matchId, ids));
    const knownIds = new Set(known.map((row) => row.matchId));
    const rows = batch.filter((match) => knownIds.has(match.metadata.matchId)).flatMap(rowsFor);
    if (rows.length) {
      await db.insert(metaChampionLoadouts).values(rows).onConflictDoNothing();
      restored += rows.length;
    }
    batch = [];
  };

  for await (const line of lines) {
    if (!line) continue;
    const record = JSON.parse(line) as { raw?: Match };
    if (!record.raw?.metadata?.matchId) continue;
    batch.push(record.raw);
    records++;
    if (batch.length >= 100) {
      await flush();
      console.log(`Read ${records} archived matches; restored ${restored} loadouts.`);
    }
  }
  await flush();
  console.log(`Champion loadout backfill complete: ${records} archived matches read; ${restored} participant loadouts inserted.`);
}

void runScript(main);
