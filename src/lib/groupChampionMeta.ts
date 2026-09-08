import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { matchParticipants, matches, trackedAccounts } from '@/db/schema';
import { ROLES } from '@/lib/rating/metrics';
import { RANKED_QUEUES } from '@/lib/riot/types';
import { seasonStart } from '@/lib/titles';

export type GroupChampionMetaRow = {
  name: string;
  role: 'Top' | 'Jungle' | 'Middle' | 'Bottom' | 'Support';
  tier: 'S+' | 'S' | 'A' | 'B';
  winRate: number;
  rawWinRate: number;
  pickRate: number;
  banRate: number;
  games: string;
  kda: number;
  strongInto: string[];
  established: boolean;
};

/** A champion needs enough games before it can be ranked as a group comfort pick. */
const QUALIFICATION_GAMES = 10;
/** Prevent a handful of games from outweighing the group’s normal role win rate. */
const PRIOR_GAMES = 12;

const ROLE_LABEL = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Middle',
  BOTTOM: 'Bottom',
  UTILITY: 'Support',
} as const;

type StoredRawMatch = { info?: { teams?: { bans?: { championId: number }[] }[] } };

/**
 * Private-group champion stats. This deliberately reads the ordinary match
 * store rather than the public collector: friends only need the games that
 * GapDiff already ingests for their tracked accounts.
 */
export async function getGroupChampionMeta(groupId: number): Promise<{
  rows: GroupChampionMetaRow[];
  matches: number;
}> {
  const members = await db
    .select({ puuid: trackedAccounts.puuid })
    .from(trackedAccounts)
    .where(eq(trackedAccounts.groupId, groupId));
  const puuids = members.map((member) => member.puuid);
  if (puuids.length === 0) return { rows: [], matches: 0 };

  const since = seasonStart();
  const participantRows = await db
    .select({
      matchId: matchParticipants.matchId,
      championId: matchParticipants.championId,
      championName: matchParticipants.championName,
      role: matchParticipants.role,
      win: matchParticipants.win,
      kills: matchParticipants.kills,
      deaths: matchParticipants.deaths,
      assists: matchParticipants.assists,
      raw: matches.raw,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.matchId, matchParticipants.matchId))
    .where(
      and(
        inArray(matchParticipants.puuid, puuids),
        eq(matches.scorable, true),
        inArray(matches.queueId, RANKED_QUEUES),
        gte(matches.gameCreation, since),
      ),
    );

  const roleTotals = new Map<string, number>();
  const roleWins = new Map<string, number>();
  const byChampion = new Map<string, {
    id: number;
    name: string;
    role: keyof typeof ROLE_LABEL;
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    matchIds: Set<string>;
    bans: number;
  }>();
  const rawByMatch = new Map<string, StoredRawMatch>();

  for (const row of participantRows) {
    if (!ROLES.includes(row.role as (typeof ROLES)[number])) continue;
    const role = row.role as keyof typeof ROLE_LABEL;
    roleTotals.set(role, (roleTotals.get(role) ?? 0) + 1);
    roleWins.set(role, (roleWins.get(role) ?? 0) + (row.win ? 1 : 0));
    rawByMatch.set(row.matchId, row.raw as StoredRawMatch);

    const key = `${row.championId}|${role}`;
    const current = byChampion.get(key) ?? {
      id: row.championId,
      name: row.championName,
      role,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      matchIds: new Set<string>(),
      bans: 0,
    };
    current.games += 1;
    current.wins += row.win ? 1 : 0;
    current.kills += row.kills;
    current.deaths += row.deaths;
    current.assists += row.assists;
    current.matchIds.add(row.matchId);
    byChampion.set(key, current);
  }

  for (const raw of rawByMatch.values()) {
    for (const ban of raw.info?.teams?.flatMap((team) => team.bans ?? []) ?? []) {
      for (const champion of byChampion.values()) {
        if (champion.id === ban.championId) champion.bans += 1;
      }
    }
  }

  const rows = [...byChampion.values()]
    .map((champion) => {
      const rawWinRate = champion.games ? (champion.wins / champion.games) * 100 : 0;
      const games = champion.games;
      const roleGames = roleTotals.get(champion.role) ?? games;
      const roleWinRate = (roleWins.get(champion.role) ?? 0) / roleGames;
      // Empirical Bayes: each champion starts with 12 games at the group’s
      // normal win rate for that role, then its real games take over.
      const winRate = ((champion.wins + roleWinRate * PRIOR_GAMES) / (games + PRIOR_GAMES)) * 100;
      const established = games >= QUALIFICATION_GAMES;
      const tier: GroupChampionMetaRow['tier'] =
        established && winRate >= 56 ? 'S+' : established && winRate >= 52 ? 'S' : established && winRate >= 48 ? 'A' : 'B';
      return {
        name: champion.name,
        role: ROLE_LABEL[champion.role],
        tier,
        winRate,
        rawWinRate,
        pickRate: (games / roleGames) * 100,
        banRate: rawByMatch.size ? (champion.bans / rawByMatch.size) * 100 : 0,
        games: games.toLocaleString('en-US'),
        kda: champion.deaths === 0 ? champion.kills + champion.assists : (champion.kills + champion.assists) / champion.deaths,
        // Matchups need opponent data; that is the next group-meta increment.
        strongInto: [],
        established,
      };
    })
    .sort((a, b) => Number(b.established) - Number(a.established) || b.winRate - a.winRate || Number.parseInt(b.games.replaceAll(',', ''), 10) - Number.parseInt(a.games.replaceAll(',', ''), 10));

  return { rows, matches: rawByMatch.size };
}
