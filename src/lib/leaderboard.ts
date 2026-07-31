import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  accountClaims,
  accounts,
  trackedAccounts,
  groups,
  matchParticipants,
  matches,
  rankSnapshots,
  users,
} from '@/db/schema';
import { buildLeaderboard, type Rating } from './rating/rating';
import {
  assignTitles,
  currentPeriodIndex,
  MIN_GAMES_FOR_TITLE,
  periodWindow,
  seasonStart,
  STAT_BOARDS,
  type HeldTitle,
  type PeriodWindow,
  type StatBoard,
  type TitleStats,
} from './titles';

/**
 * The friend-group standings, computed from ingested match history.
 *
 * This is the half of the product that needs a database: a profile page can be
 * answered live from Riot, but ranking people against each other needs games
 * accumulated over time, and the Riot API has no endpoint for "everything this
 * group played".
 */

export interface LeaderboardPlayer {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  /** Manual override; when set it wins over the earned title. */
  nickname: string | null;
  profileIconId: number | null;
  /** Discord avatar, only when somebody has *proved* they own this account. */
  ownerImage: string | null;
  ownerName: string | null;
  verified: boolean;
  /** Pooled across the season: (kills + assists) / deaths. */
  kda: number;
  rank: { tier: string; division: string; leaguePoints: number } | null;
  /** Per-game performance scores, most recent first. */
  form: number[];
  /** Every title this player currently leads, most dominant first. */
  titles: HeldTitle[];
  /** Shown next to the name. Null when they lead nothing. */
  title: HeldTitle | null;
  /** Games inside the title window — what eligibility is judged on. */
  windowGames: number;
}

export interface LeaderboardEntry {
  player: LeaderboardPlayer;
  rating: Rating;
  position: number;
  gapToNext: number;
}

/** One player's place on a single stat board. */
export interface StatBoardRow {
  puuid: string;
  gameName: string;
  platform: string;
  tagLine: string;
  position: number;
  value: number;
  formatted: string;
  games: number;
  /** False when below the games threshold — shown, but can't hold the title. */
  eligible: boolean;
  holdsTitle: boolean;
}

export interface StatBoardResult {
  id: string;
  label: string;
  metricLabel: string;
  rows: StatBoardRow[];
}

export interface GroupStandings {
  group: { slug: string; name: string };
  entries: LeaderboardEntry[];
  totalGames: number;
  /** Standings cover the season; titles are contested one month at a time. */
  period: PeriodWindow & { games: number; latestIndex: number };
  boards: StatBoardResult[];
}

export async function getGroupStandings(
  slug: string,
  periodIndex?: number,
): Promise<GroupStandings | null> {
  const [group] = await db.select().from(groups).where(eq(groups.slug, slug)).limit(1);
  if (!group) return null;

  const latestIndex = currentPeriodIndex();
  const period = periodWindow(periodIndex ?? latestIndex);

  // Left joins, not inner: an account can sit on the board with nobody
  // attached, which is how somebody who has stopped playing stays in the
  // standings. Only a *verified* claim earns the Discord avatar.
  const members = await db
    .select({
      puuid: accounts.puuid,
      gameName: accounts.gameName,
      tagLine: accounts.tagLine,
      platform: accounts.platform,
      profileIconId: accounts.profileIconId,
      nickname: trackedAccounts.nickname,
      verifiedAt: accountClaims.verifiedAt,
      ownerName: users.name,
      ownerImage: users.image,
    })
    .from(trackedAccounts)
    .innerJoin(accounts, eq(accounts.puuid, trackedAccounts.puuid))
    .leftJoin(
      accountClaims,
      and(
        eq(accountClaims.puuid, trackedAccounts.puuid),
        isNotNull(accountClaims.verifiedAt),
      ),
    )
    .leftJoin(users, eq(users.id, accountClaims.userId))
    .where(eq(trackedAccounts.groupId, group.id));

  if (members.length === 0) {
    return {
      group: { slug: group.slug, name: group.name },
      entries: [],
      totalGames: 0,
      period: { ...period, games: 0, latestIndex },
      boards: [],
    };
  }

  const puuids = members.map((m) => m.puuid);

  // Every scored game this season for these players, newest first. Volumes are
  // a handful of people times a few hundred games, so one pass is plenty.
  const since = seasonStart();
  const rows = await db
    .select({
      puuid: matchParticipants.puuid,
      win: matchParticipants.win,
      score: matchParticipants.performanceScore,
      csPerMin: matchParticipants.csPerMin,
      visionPerMin: matchParticipants.visionPerMin,
      damageShare: matchParticipants.damageShare,
      damageTakenShare: matchParticipants.damageTakenShare,
      goldShare: matchParticipants.goldShare,
      objectiveDamageShare: matchParticipants.objectiveDamageShare,
      killParticipation: matchParticipants.killParticipation,
      deathShare: matchParticipants.deathShare,
      soloKills: matchParticipants.soloKills,
      kills: matchParticipants.kills,
      deaths: matchParticipants.deaths,
      assists: matchParticipants.assists,
      playedAt: matches.gameCreation,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.matchId, matchParticipants.matchId))
    .where(
      and(
        inArray(matchParticipants.puuid, puuids),
        eq(matches.scorable, true),
        gte(matches.gameCreation, since),
      ),
    )
    .orderBy(desc(matches.gameCreation));

  // Latest ranked-solo standing per player.
  const snapshots = await db
    .select({
      puuid: rankSnapshots.puuid,
      tier: rankSnapshots.tier,
      division: rankSnapshots.division,
      leaguePoints: rankSnapshots.leaguePoints,
      capturedAt: rankSnapshots.capturedAt,
    })
    .from(rankSnapshots)
    .where(
      and(
        inArray(rankSnapshots.puuid, puuids),
        eq(rankSnapshots.queueType, 'RANKED_SOLO_5x5'),
      ),
    )
    .orderBy(desc(rankSnapshots.capturedAt));

  const latestRank = new Map<string, { tier: string; division: string; leaguePoints: number }>();
  for (const snapshot of snapshots) {
    if (!latestRank.has(snapshot.puuid)) {
      latestRank.set(snapshot.puuid, {
        tier: snapshot.tier,
        division: snapshot.division,
        leaguePoints: snapshot.leaguePoints,
      });
    }
  }

  type Bucket = {
    scores: number[];
    wins: number;
    losses: number;
    /** Season totals, pooled so one deathless game can't produce infinite KDA. */
    kills: number;
    deaths: number;
    assists: number;
    /** Only games inside the title window. */
    windowRows: (typeof rows)[number][];
    windowScores: number[];
  };

  const byPlayer = new Map<string, Bucket>();
  for (const puuid of puuids) {
    byPlayer.set(puuid, {
      scores: [],
      wins: 0,
      losses: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      windowRows: [],
      windowScores: [],
    });
  }

  let windowGames = 0;

  for (const row of rows) {
    const bucket = byPlayer.get(row.puuid);
    if (!bucket) continue;
    if (row.score !== null) bucket.scores.push(row.score);
    if (row.win) bucket.wins++;
    else bucket.losses++;

    bucket.kills += row.kills;
    bucket.deaths += row.deaths;
    bucket.assists += row.assists;

    // Bounded at both ends, otherwise browsing to an old month would still
    // count newer games.
    if (row.playedAt >= period.start && row.playedAt < period.end) {
      bucket.windowRows.push(row);
      if (row.score !== null) bucket.windowScores.push(row.score);
      windowGames++;
    }
  }

  const statsByPlayer = new Map<string, TitleStats>();
  for (const member of members) {
    statsByPlayer.set(
      member.puuid,
      toTitleStats(member.puuid, byPlayer.get(member.puuid)!),
    );
  }

  const awards = assignTitles([...statsByPlayer.values()]);
  const boards = buildStatBoards(members, statsByPlayer, awards);

  const ranked = buildLeaderboard(
    members.map((member) => {
      const bucket = byPlayer.get(member.puuid)!;
      const award = awards.get(member.puuid);
      return {
        player: {
          puuid: member.puuid,
          gameName: member.gameName,
          tagLine: member.tagLine,
          platform: member.platform,
          nickname: member.nickname,
          profileIconId: member.profileIconId,
          ownerImage: member.verifiedAt ? member.ownerImage : null,
          ownerName: member.verifiedAt ? member.ownerName : null,
          verified: member.verifiedAt !== null,
          kda:
            bucket.deaths === 0
              ? bucket.kills + bucket.assists
              : (bucket.kills + bucket.assists) / bucket.deaths,
          rank: latestRank.get(member.puuid) ?? null,
          form: bucket.scores,
          titles: award?.titles ?? [],
          title: award?.primary ?? null,
          windowGames: bucket.windowRows.length,
        } satisfies LeaderboardPlayer,
        input: {
          scores: bucket.scores,
          wins: bucket.wins,
          losses: bucket.losses,
          rank: latestRank.get(member.puuid) ?? null,
        },
      };
    }),
  );

  return {
    group: { slug: group.slug, name: group.name },
    entries: ranked,
    totalGames: rows.length,
    period: { ...period, games: windowGames, latestIndex },
    boards,
  };
}

/**
 * Ranks the whole group on each board, not just the leader — the interesting
 * part is how far behind everyone else is.
 */
function buildStatBoards(
  members: { puuid: string; gameName: string; tagLine: string; platform: string }[],
  stats: Map<string, TitleStats>,
  awards: Map<string, { titles: HeldTitle[] }>,
): StatBoardResult[] {
  return STAT_BOARDS.map((board: StatBoard) => {
    const rows = members
      .map((member) => {
        const playerStats = stats.get(member.puuid)!;
        const value = board.value(playerStats);
        const eligible = playerStats.games >= MIN_GAMES_FOR_TITLE;
        return {
          puuid: member.puuid,
          gameName: member.gameName,
          tagLine: member.tagLine,
          platform: member.platform,
          position: 0,
          value,
          formatted: board.format(value),
          games: playerStats.games,
          eligible,
          holdsTitle:
            board.titleId !== undefined &&
            (awards.get(member.puuid)?.titles ?? []).some((t) => t.id === board.titleId),
        };
      })
      // Players with no games in the window sort last whatever the metric.
      .sort((a, b) => {
        if (a.games === 0 !== (b.games === 0)) return a.games === 0 ? 1 : -1;
        return board.direction === 'max' ? b.value - a.value : a.value - b.value;
      })
      .map((row, index) => ({ ...row, position: index + 1 }));

    return { id: board.id, label: board.label, metricLabel: board.metricLabel, rows };
  });
}

/** Titles run on the month window, not the whole season. */
function toTitleStats(
  puuid: string,
  bucket: {
    windowScores: number[];
    windowRows: {
      csPerMin: number;
      visionPerMin: number;
      damageShare: number;
      damageTakenShare: number;
      goldShare: number;
      objectiveDamageShare: number;
      killParticipation: number;
      deathShare: number;
      soloKills: number;
      kills: number;
      deaths: number;
      assists: number;
    }[];
  },
): TitleStats {
  const rows = bucket.windowRows;
  const scores = bucket.windowScores;
  const mean = (pick: (row: (typeof rows)[number]) => number) =>
    rows.length ? rows.reduce((sum, row) => sum + pick(row), 0) / rows.length : 0;

  const scoreMean = scores.length
    ? scores.reduce((sum, s) => sum + s, 0) / scores.length
    : 0;
  const scoreStdDev =
    scores.length > 1
      ? Math.sqrt(
          scores.reduce((sum, s) => sum + (s - scoreMean) ** 2, 0) / (scores.length - 1),
        )
      : 0;

  const totals = rows.reduce(
    (acc, row) => ({
      kills: acc.kills + row.kills,
      deaths: acc.deaths + row.deaths,
      assists: acc.assists + row.assists,
    }),
    { kills: 0, deaths: 0, assists: 0 },
  );

  return {
    puuid,
    games: rows.length,
    csPerMin: mean((r) => r.csPerMin),
    visionPerMin: mean((r) => r.visionPerMin),
    damageShare: mean((r) => r.damageShare),
    damageTakenShare: mean((r) => r.damageTakenShare),
    goldShare: mean((r) => r.goldShare),
    objectiveDamageShare: mean((r) => r.objectiveDamageShare),
    killParticipation: mean((r) => r.killParticipation),
    deathShare: mean((r) => r.deathShare),
    deathsPerGame: mean((r) => r.deaths),
    killsPerGame: mean((r) => r.kills),
    assistsPerGame: mean((r) => r.assists),
    // Pooled across the window rather than averaging each game's ratio, so one
    // deathless game can't produce an infinite KDA.
    kda:
      totals.deaths === 0
        ? totals.kills + totals.assists
        : (totals.kills + totals.assists) / totals.deaths,
    soloKillsPerGame: mean((r) => r.soloKills),
    scoreStdDev,
  };
}

/** Groups available to link to from the home page. */
export async function listGroups(): Promise<{ slug: string; name: string }[]> {
  return db.select({ slug: groups.slug, name: groups.name }).from(groups);
}
