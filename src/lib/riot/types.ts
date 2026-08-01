/**
 * Partial shapes for the Riot endpoints we use. These cover the fields the app
 * actually reads — Riot returns considerably more, and the raw payload is kept
 * in the database so nothing is lost by narrowing here.
 */

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface Summoner {
  puuid: string;
  /** Deprecated by Riot in favour of puuid; may be absent on newer responses. */
  id?: string;
  accountId?: string;
  profileIconId: number;
  summonerLevel: number;
  revisionDate: number;
}

export type QueueType =
  | 'RANKED_SOLO_5x5'
  | 'RANKED_FLEX_SR'
  | 'RANKED_FLEX_TT'
  | 'CHERRY';

export interface LeagueEntry {
  queueType: QueueType | string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
  inactive: boolean;
}

export type TeamPosition = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY' | '';

export interface MatchParticipant {
  puuid: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  /** Icon worn at the time of the match, so it can drift from the live profile. */
  profileIcon?: number;
  participantId: number;
  teamId: number;
  win: boolean;

  championId: number;
  championName: string;
  champLevel: number;
  /** Riot's own inference; can be empty on remakes and odd queues. */
  teamPosition: TeamPosition;
  individualPosition: TeamPosition;
  role: string;
  lane: string;

  kills: number;
  deaths: number;
  assists: number;

  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  damageDealtToObjectives: number;
  damageDealtToTurrets: number;
  totalHeal: number;
  totalHealsOnTeammates: number;
  totalDamageShieldedOnTeammates: number;

  goldEarned: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;

  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  visionWardsBoughtInGame: number;
  detectorWardsPlaced: number;

  turretTakedowns: number;
  dragonKills: number;
  baronKills: number;
  objectivesStolen: number;

  firstBloodKill: boolean;
  firstTowerKill: boolean;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  longestTimeSpentLiving: number;
  timeCCingOthers: number;
  totalTimeSpentDead: number;

  gameEndedInEarlySurrender: boolean;
  gameEndedInSurrender: boolean;

  summoner1Id: number;
  summoner2Id: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;

  perks?: unknown;
  challenges?: Record<string, number>;
}

export interface MatchTeamObjective {
  first: boolean;
  kills: number;
}

export interface MatchTeam {
  teamId: number;
  win: boolean;
  objectives: {
    baron: MatchTeamObjective;
    champion: MatchTeamObjective;
    dragon: MatchTeamObjective;
    inhibitor: MatchTeamObjective;
    riftHerald: MatchTeamObjective;
    tower: MatchTeamObjective;
    horde?: MatchTeamObjective;
  };
}

export interface MatchInfo {
  gameId: number;
  gameCreation: number;
  gameStartTimestamp: number;
  gameEndTimestamp?: number;
  gameDuration: number;
  gameMode: string;
  gameType: string;
  gameVersion: string;
  mapId: number;
  platformId: string;
  queueId: number;
  participants: MatchParticipant[];
  teams: MatchTeam[];
}

export interface Match {
  metadata: {
    dataVersion: string;
    matchId: string;
    participants: string[];
  };
  info: MatchInfo;
}

export interface MatchTimelineEvent {
  type: string;
  timestamp: number;
  participantId?: number;
  killerId?: number;
  victimId?: number;
  assistingParticipantIds?: number[];
  position?: { x: number; y: number };
  wardType?: string;
  monsterType?: string;
  buildingType?: string;
  itemId?: number;
  [key: string]: unknown;
}

export interface MatchTimelineFrame {
  timestamp: number;
  events: MatchTimelineEvent[];
  participantFrames: Record<
    string,
    {
      participantId: number;
      currentGold: number;
      totalGold: number;
      xp: number;
      level: number;
      minionsKilled: number;
      jungleMinionsKilled: number;
      position?: { x: number; y: number };
    }
  >;
}

export interface MatchTimeline {
  metadata: { matchId: string; participants: string[] };
  info: {
    frameInterval: number;
    frames: MatchTimelineFrame[];
    participants: { participantId: number; puuid: string }[];
  };
}

export interface CurrentGameParticipant {
  puuid: string;
  championId: number;
  teamId: number;
  spell1Id: number;
  spell2Id: number;
  profileIconId: number;
  bot: boolean;
}

export interface CurrentGameInfo {
  gameId: number;
  gameType: string;
  gameStartTime: number;
  mapId: number;
  gameLength: number;
  platformId: string;
  gameMode: string;
  gameQueueConfigId: number;
  participants: CurrentGameParticipant[];
  bannedChampions: { championId: number; teamId: number; pickTurn: number }[];
}

export interface ChampionMastery {
  puuid: string;
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
}

/** Queue ids we care about on Summoner's Rift. */
export const QUEUE_IDS = {
  RANKED_SOLO: 420,
  NORMAL_DRAFT: 400,
  RANKED_FLEX: 440,
  NORMAL_BLIND: 430,
  ARAM: 450,
  CLASH: 700,
  ARENA: 1700,
} as const;

export const RANKED_QUEUES: number[] = [QUEUE_IDS.RANKED_SOLO, QUEUE_IDS.RANKED_FLEX];

/** Queues that produce meaningful performance data (excludes ARAM/Arena/bots). */
export const RATED_QUEUES: number[] = [
  QUEUE_IDS.RANKED_SOLO,
  QUEUE_IDS.RANKED_FLEX,
  QUEUE_IDS.NORMAL_DRAFT,
  QUEUE_IDS.NORMAL_BLIND,
  QUEUE_IDS.CLASH,
];
