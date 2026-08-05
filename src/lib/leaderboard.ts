import { and, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
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
  /** Set alongside ownerName/ownerImage — who to send a friend request to. */
  ownerId: string | null;
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
  /** Set when this holder took the title off somebody else last week. */
  takenFrom: string | null;
}

export interface StatBoardResult {
  id: string;
  label: string;
  metricLabel: string;
  rows: StatBoardRow[];
}

/**
 * One pairing of group members. `a` is always the lexicographically smaller
 * puuid, so a pair has exactly one row whichever way round it is found.
 *
 * Both directions are counted because a friend group generates almost entirely
 * `together` rows — you queue with each other, so the draw rarely puts you on
 * opposite sides. `against` stays for when it does.
 */
export interface PairRecord {
  aPuuid: string;
  bPuuid: string;
  /** Same team. Wins are shared, so one counter covers both players. */
  togetherGames: number;
  togetherWins: number;
  /** Opposite teams. */
  againstGames: number;
  againstAWins: number;
  /** Mean gap score while on the same team; null if none were scored. */
  aScore: number | null;
  bScore: number | null;
}

export interface GroupStandings {
  group: { slug: string; name: string };
  entries: LeaderboardEntry[];
  totalGames: number;
  /** Standings cover the season; titles are contested one week at a time. */
  period: PeriodWindow & { games: number; latestIndex: number };
  boards: StatBoardResult[];
  /** Member-with-member and member-vs-member games in the selected period. */
  pairings: PairRecord[];
}

/**
 * @param asOf Compute the board as it stood at this instant, ignoring anything
 *   later. Every match is stored, so a past standing is reproduced exactly
 *   rather than approximated — which is what makes "up two places since last
 *   week" answerable without keeping a table of daily positions.
 */
export async function getGroupStandings(
  slug: string,
  periodIndex?: number,
  asOf?: Date,
): Promise<GroupStandings | null> {
  const [group] = await db.select().from(groups).where(eq(groups.slug, slug)).limit(1);
  if (!group) return null;

  const latestIndex = currentPeriodIndex();
  const period = periodWindow(periodIndex ?? latestIndex);

  // An asOf inside the period truncates it; one after it changes nothing.
  const cutoff =
    asOf && asOf < period.end ? asOf : period.end;

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
      ownerId: accountClaims.userId,
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
      pairings: [],
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
      // Pre-squash composites, the only pair directly comparable to each other.
      performanceRaw: matchParticipants.performanceRaw,
      opponentRaw: matchParticipants.opponentRaw,
      playedAt: matches.gameCreation,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.matchId, matchParticipants.matchId))
    .where(
      and(
        inArray(matchParticipants.puuid, puuids),
        eq(matches.scorable, true),
        gte(matches.gameCreation, since),
        lt(matches.gameCreation, cutoff),
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

  /*
   * Rank as it stood at the end of the period being viewed, not as it stands
   * today.
   *
   * Everything else on this page is scoped to the selected week, but the rank
   * pillar used the newest snapshot regardless — so an old week's board showed
   * that week's performance beside this week's LP, and a climb this week
   * retroactively lifted every earlier week.
   *
   * Snapshots only began accumulating on 2026-07-31, so weeks before that have
   * nothing in range. Those fall back to the oldest snapshot on record rather
   * than to null: reporting a whole group as unranked would drop the rank
   * pillar entirely and rewrite the standings, which is a worse lie than a
   * slightly stale rank. As history accumulates the fallback stops being hit.
   */
  type Snapshot = { tier: string; division: string; leaguePoints: number };
  const rankInPeriod = new Map<string, Snapshot>();
  const oldestKnown = new Map<string, Snapshot>();

  // Ordered newest first, so the first hit in range is the one that period
  // ended on, and the final write to oldestKnown is the earliest on record.
  for (const snapshot of snapshots) {
    const value: Snapshot = {
      tier: snapshot.tier,
      division: snapshot.division,
      leaguePoints: snapshot.leaguePoints,
    };
    if (snapshot.capturedAt < cutoff && !rankInPeriod.has(snapshot.puuid)) {
      rankInPeriod.set(snapshot.puuid, value);
    }
    oldestKnown.set(snapshot.puuid, value);
  }

  const rankFor = (puuid: string): Snapshot | null =>
    rankInPeriod.get(puuid) ?? oldestKnown.get(puuid) ?? null;

  /**
   * Everything on this page describes the selected week, not the season.
   * Browsing to an old week should show that week's standings — a season-wide
   * score sitting above a week's titles would be two different stories on
   * one page.
   */
  type Bucket = {
    wins: number;
    losses: number;
    /** Pooled so one deathless game can't produce an infinite KDA. */
    kills: number;
    deaths: number;
    assists: number;
    windowRows: (typeof rows)[number][];
    windowScores: number[];
    /** The week before, used only to work out who lost a title. */
    prevRows: (typeof rows)[number][];
    prevScores: number[];
  };

  const byPlayer = new Map<string, Bucket>();
  for (const puuid of puuids) {
    byPlayer.set(puuid, {
      wins: 0,
      losses: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      windowRows: [],
      windowScores: [],
      prevRows: [],
      prevScores: [],
    });
  }

  const previous = period.index > 0 ? periodWindow(period.index - 1) : null;
  let windowGames = 0;

  for (const row of rows) {
    const bucket = byPlayer.get(row.puuid);
    if (!bucket) continue;

    // Bounded at both ends, otherwise browsing to an old week would still
    // count newer games.
    if (row.playedAt >= period.start && row.playedAt < cutoff) {
      bucket.windowRows.push(row);
      if (row.score !== null) bucket.windowScores.push(row.score);
      if (row.win) bucket.wins++;
      else bucket.losses++;
      bucket.kills += row.kills;
      bucket.deaths += row.deaths;
      bucket.assists += row.assists;
      windowGames++;
    } else if (
      previous &&
      row.playedAt >= previous.start &&
      row.playedAt < previous.end
    ) {
      bucket.prevRows.push(row);
      if (row.score !== null) bucket.prevScores.push(row.score);
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

  // Last week's holders, so a title can say who it was taken from.
  const previousHolders = new Map<string, string>();
  if (previous) {
    const prevStats = members.map((member) => {
      const bucket = byPlayer.get(member.puuid)!;
      return toTitleStats(member.puuid, {
        windowRows: bucket.prevRows,
        windowScores: bucket.prevScores,
      });
    });
    for (const [puuid, award] of assignTitles(prevStats)) {
      const name = members.find((m) => m.puuid === puuid)?.gameName;
      if (!name) continue;
      for (const title of award.titles) previousHolders.set(title.id, name);
    }
  }

  const boards = buildStatBoards(members, statsByPlayer, awards, previousHolders);

  // Scoped to the selected period like everything else on the page, so browsing
  // to an old week shows that week's pairings rather than a season total under
  // that week's titles.
  const pairings = await getPairings(puuids, period.start, cutoff);

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
          ownerId: member.verifiedAt ? member.ownerId : null,
          verified: member.verifiedAt !== null,
          kda:
            bucket.deaths === 0
              ? bucket.kills + bucket.assists
              : (bucket.kills + bucket.assists) / bucket.deaths,
          rank: rankFor(member.puuid),
          form: bucket.windowScores,
          titles: award?.titles ?? [],
          title: award?.primary ?? null,
          windowGames: bucket.windowRows.length,
        } satisfies LeaderboardPlayer,
        input: {
          scores: bucket.windowScores,
          wins: bucket.wins,
          losses: bucket.losses,
          rank: rankFor(member.puuid),
        },
      };
    }),
  );

  return {
    group: { slug: group.slug, name: group.name },
    entries: ranked,
    totalGames: windowGames,
    period: { ...period, games: windowGames, latestIndex },
    boards,
    pairings,
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
  previousHolders: Map<string, string>,
): StatBoardResult[] {
  return STAT_BOARDS.map((board: StatBoard) => {
    const holderName = members.find((m) =>
      board.titleId !== undefined
        ? (awards.get(m.puuid)?.titles ?? []).some((t) => t.id === board.titleId)
        : false,
    )?.gameName;

    const previousHolder = board.titleId ? previousHolders.get(board.titleId) : undefined;
    const changedHands =
      previousHolder !== undefined && holderName !== undefined && previousHolder !== holderName;

    const rows = members
      .map((member) => {
        const playerStats = stats.get(member.puuid)!;
        const value = board.value(playerStats);
        const eligible = playerStats.games >= MIN_GAMES_FOR_TITLE;
        const holdsTitle =
          board.titleId !== undefined &&
          (awards.get(member.puuid)?.titles ?? []).some((t) => t.id === board.titleId);

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
          holdsTitle,
          takenFrom: holdsTitle && changedHands ? (previousHolder ?? null) : null,
        };
      })
      /*
       * Anyone short of the games threshold sorts below everyone eligible,
       * whatever their number. Two games at 9.4 deaths is noise, and showing it
       * above someone who played thirty makes the board look wrong even though
       * the title itself was awarded correctly.
       */
      .sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        if (a.games === 0 !== (b.games === 0)) return a.games === 0 ? 1 : -1;
        return board.direction === 'max' ? b.value - a.value : a.value - b.value;
      })
      .map((row, index) => ({ ...row, position: index + 1 }));

    return { id: board.id, label: board.label, metricLabel: board.metricLabel, rows };
  });
}

/**
 * Every time two members of the same group landed in one lobby, on either side.
 *
 * Only possible because the ingester stores all ten participants of a match
 * rather than just the tracked ones — the pairing is discovered from the lobby,
 * not from anybody declaring a duo.
 */
async function getPairings(
  puuids: string[],
  from: Date,
  to: Date,
): Promise<PairRecord[]> {
  if (puuids.length < 2) return [];

  const mine = alias(matchParticipants, 'mine');
  const theirs = alias(matchParticipants, 'theirs');

  const rows = await db
    .select({
      aPuuid: mine.puuid,
      bPuuid: theirs.puuid,
      aTeam: mine.teamId,
      bTeam: theirs.teamId,
      aWin: mine.win,
      aScore: mine.performanceScore,
      bScore: theirs.performanceScore,
    })
    .from(mine)
    .innerJoin(
      theirs,
      and(
        eq(theirs.matchId, mine.matchId),
        // Each meeting satisfies the join twice, once from either side. Keeping
        // a single ordering halves the rows and makes every pair canonical.
        lt(mine.puuid, theirs.puuid),
      ),
    )
    .innerJoin(matches, eq(matches.matchId, mine.matchId))
    .where(
      and(
        inArray(mine.puuid, puuids),
        inArray(theirs.puuid, puuids),
        eq(matches.scorable, true),
        gte(matches.gameCreation, from),
        lt(matches.gameCreation, to),
      ),
    );

  const pairs = new Map<string, PairRecord & { aScores: number[]; bScores: number[] }>();

  for (const row of rows) {
    const key = `${row.aPuuid}|${row.bPuuid}`;
    let pair = pairs.get(key);
    if (!pair) {
      pair = {
        aPuuid: row.aPuuid,
        bPuuid: row.bPuuid,
        togetherGames: 0,
        togetherWins: 0,
        againstGames: 0,
        againstAWins: 0,
        aScore: null,
        bScore: null,
        aScores: [],
        bScores: [],
      };
      pairs.set(key, pair);
    }

    if (row.aTeam === row.bTeam) {
      pair.togetherGames += 1;
      if (row.aWin) pair.togetherWins += 1;
      // Scores are only averaged over shared games, where the comparison is
      // like for like: same team, same match, same result.
      if (row.aScore !== null) pair.aScores.push(row.aScore);
      if (row.bScore !== null) pair.bScores.push(row.bScore);
    } else {
      pair.againstGames += 1;
      if (row.aWin) pair.againstAWins += 1;
    }
  }

  const average = (values: number[]) =>
    values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

  return [...pairs.values()]
    .map(({ aScores, bScores, ...pair }) => ({
      ...pair,
      aScore: average(aScores),
      bScore: average(bScores),
    }))
    .sort(
      (x, y) =>
        y.togetherGames + y.againstGames - (x.togetherGames + x.againstGames),
    );
}

/** Titles run on the week window, not the whole season. */
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
      performanceRaw: number | null;
      opponentRaw: number | null;
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

  // Only games that actually had an opposite number count as duels; a lobby
  // where role inference failed on one side has nobody to compare against.
  const duels = rows.filter(
    (row): row is typeof row & { performanceRaw: number; opponentRaw: number } =>
      row.performanceRaw !== null && row.opponentRaw !== null,
  );
  const laneWins = duels.filter((row) => row.performanceRaw > row.opponentRaw).length;

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
    laneDuels: duels.length,
    laneWinRate: duels.length ? laneWins / duels.length : 0,
  };
}

/** Groups available to link to from the home page. */
export async function listGroups(): Promise<{ slug: string; name: string }[]> {
  return db.select({ slug: groups.slug, name: groups.name }).from(groups);
}
