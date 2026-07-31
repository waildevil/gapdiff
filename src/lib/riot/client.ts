import { RiotRateLimiter } from './limiter';
import {
  platformHost,
  regionForPlatform,
  regionHost,
  type Platform,
  type Region,
} from './routing';
import type {
  ChampionMastery,
  CurrentGameInfo,
  LeagueEntry,
  Match,
  MatchTimeline,
  RiotAccount,
  Summoner,
} from './types';

export class RiotApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly url: string,
    message?: string,
  ) {
    super(message ?? `Riot API ${status} on ${method}`);
    this.name = 'RiotApiError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export interface RiotClientOptions {
  apiKey: string;
  /** Attempts per request, including the first. */
  maxRetries?: number;
  /** Shared across clients so one budget covers the whole process. */
  limiter?: RiotRateLimiter;
  fetch?: typeof fetch;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RiotClient {
  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly limiter: RiotRateLimiter;
  private readonly doFetch: typeof fetch;

  constructor(options: RiotClientOptions) {
    if (!options.apiKey) {
      throw new Error('RIOT_API_KEY is missing. Copy .env.example to .env and set it.');
    }
    this.apiKey = options.apiKey;
    this.maxRetries = options.maxRetries ?? 4;
    this.limiter = options.limiter ?? new RiotRateLimiter();
    this.doFetch = options.fetch ?? globalThis.fetch;
  }

  /**
   * `method` is the rate-limit bucket key, not the HTTP verb — Riot meters per
   * endpoint, so it must identify the endpoint and not include path parameters.
   */
  private async request<T>(host: string, path: string, method: string): Promise<T> {
    const url = `${host}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      await this.limiter.acquire(method);

      let response: Response;
      try {
        response = await this.doFetch(url, {
          headers: { 'X-Riot-Token': this.apiKey },
        });
      } catch (error) {
        // Network-level failure: back off and retry.
        lastError = error;
        await sleep(2 ** attempt * 500);
        continue;
      }

      this.limiter.observe(method, response.headers);

      if (response.ok) {
        return (await response.json()) as T;
      }

      if (response.status === 429) {
        const seconds = this.limiter.penalise(response.headers);
        lastError = new RiotApiError(429, method, url, `Rate limited, waiting ${seconds}s`);
        continue;
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < this.maxRetries - 1) {
        lastError = new RiotApiError(response.status, method, url);
        await sleep(2 ** attempt * 500);
        continue;
      }

      throw new RiotApiError(
        response.status,
        method,
        url,
        `Riot API ${response.status} on ${method}: ${await safeBody(response)}`,
      );
    }

    throw lastError instanceof Error
      ? lastError
      : new RiotApiError(0, method, url, 'Request failed after retries');
  }

  /** Wraps a call so a missing resource yields null instead of throwing. */
  private async optional<T>(promise: Promise<T>): Promise<T | null> {
    try {
      return await promise;
    } catch (error) {
      if (error instanceof RiotApiError && error.isNotFound) return null;
      throw error;
    }
  }

  // --- ACCOUNT-V1 (regional) ------------------------------------------------

  /** The entry point: Riot ID -> PUUID. Summoner-name lookup no longer exists. */
  async getAccountByRiotId(
    region: Region,
    gameName: string,
    tagLine: string,
  ): Promise<RiotAccount> {
    return this.request<RiotAccount>(
      regionHost(region),
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      'account.byRiotId',
    );
  }

  /** Riot IDs change; re-resolving by PUUID keeps stored names fresh. */
  async getAccountByPuuid(region: Region, puuid: string): Promise<RiotAccount> {
    return this.request<RiotAccount>(
      regionHost(region),
      `/riot/account/v1/accounts/by-puuid/${puuid}`,
      'account.byPuuid',
    );
  }

  // --- SUMMONER-V4 (platform) ----------------------------------------------

  async getSummonerByPuuid(platform: Platform, puuid: string): Promise<Summoner> {
    return this.request<Summoner>(
      platformHost(platform),
      `/lol/summoner/v4/summoners/by-puuid/${puuid}`,
      'summoner.byPuuid',
    );
  }

  // --- LEAGUE-V4 (platform) ------------------------------------------------

  /**
   * Riot has been migrating league lookups from encrypted summoner id to PUUID.
   * Try the PUUID route first and fall back, so this keeps working either way.
   */
  async getLeagueEntries(
    platform: Platform,
    puuid: string,
    summonerId?: string,
  ): Promise<LeagueEntry[]> {
    const byPuuid = await this.optional(
      this.request<LeagueEntry[]>(
        platformHost(platform),
        `/lol/league/v4/entries/by-puuid/${puuid}`,
        'league.byPuuid',
      ),
    );
    if (byPuuid) return byPuuid;

    if (!summonerId) return [];
    return (
      (await this.optional(
        this.request<LeagueEntry[]>(
          platformHost(platform),
          `/lol/league/v4/entries/by-summoner/${summonerId}`,
          'league.bySummoner',
        ),
      )) ?? []
    );
  }

  // --- MATCH-V5 (regional) -------------------------------------------------

  async getMatchIds(
    region: Region,
    puuid: string,
    options: {
      start?: number;
      count?: number;
      /** Epoch *seconds*, not milliseconds — a classic source of empty results. */
      startTime?: number;
      endTime?: number;
      queue?: number;
      type?: 'ranked' | 'normal' | 'tourney' | 'tutorial';
    } = {},
  ): Promise<string[]> {
    const params = new URLSearchParams({
      start: String(options.start ?? 0),
      count: String(Math.min(options.count ?? 20, 100)),
    });
    if (options.startTime) params.set('startTime', String(options.startTime));
    if (options.endTime) params.set('endTime', String(options.endTime));
    if (options.queue) params.set('queue', String(options.queue));
    if (options.type) params.set('type', options.type);

    return this.request<string[]>(
      regionHost(region),
      `/lol/match/v5/matches/by-puuid/${puuid}/ids?${params}`,
      'match.ids',
    );
  }

  async getMatch(region: Region, matchId: string): Promise<Match> {
    return this.request<Match>(
      regionHost(region),
      `/lol/match/v5/matches/${matchId}`,
      'match.byId',
    );
  }

  async getMatchTimeline(region: Region, matchId: string): Promise<MatchTimeline> {
    return this.request<MatchTimeline>(
      regionHost(region),
      `/lol/match/v5/matches/${matchId}/timeline`,
      'match.timeline',
    );
  }

  // --- SPECTATOR-V5 (platform) ---------------------------------------------

  /** Null when the player isn't currently in a game. */
  async getActiveGame(platform: Platform, puuid: string): Promise<CurrentGameInfo | null> {
    return this.optional(
      this.request<CurrentGameInfo>(
        platformHost(platform),
        `/lol/spectator/v5/active-games/by-summoner/${puuid}`,
        'spectator.activeGame',
      ),
    );
  }

  // --- CHAMPION-MASTERY-V4 (platform) --------------------------------------

  async getChampionMasteries(
    platform: Platform,
    puuid: string,
  ): Promise<ChampionMastery[]> {
    return (
      (await this.optional(
        this.request<ChampionMastery[]>(
          platformHost(platform),
          `/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`,
          'mastery.byPuuid',
        ),
      )) ?? []
    );
  }

  // --- convenience ---------------------------------------------------------

  /** Resolves a Riot ID all the way to account + summoner + ranked entries. */
  async resolveRiotId(platform: Platform, gameName: string, tagLine: string) {
    const region = regionForPlatform(platform);
    const account = await this.getAccountByRiotId(region, gameName, tagLine);
    const summoner = await this.getSummonerByPuuid(platform, account.puuid);
    const leagues = await this.getLeagueEntries(platform, account.puuid, summoner.id);
    return { account, summoner, leagues };
  }
}

async function safeBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '<unreadable body>';
  }
}

/** Process-wide singleton so every caller shares one rate-limit budget. */
let shared: RiotClient | undefined;

export function getRiotClient(): RiotClient {
  if (!shared) {
    shared = new RiotClient({ apiKey: process.env.RIOT_API_KEY ?? '' });
  }
  return shared;
}
