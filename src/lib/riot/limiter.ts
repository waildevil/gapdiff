/**
 * Rate limiting for the Riot API.
 *
 * Riot enforces limits at two levels and advertises both on every response:
 *
 *   X-App-Rate-Limit:          20:1,100:120        (windows, as count:seconds)
 *   X-App-Rate-Limit-Count:    1:1,7:120           (current usage in those windows)
 *   X-Method-Rate-Limit:       ...                 (same, per endpoint)
 *
 * Strategy: start from the dev-key defaults, then adopt whatever the headers say.
 * Every request passes through a serialised gate that waits until all applicable
 * windows have room. A 429 pauses the relevant scope for `Retry-After` seconds.
 */

const DEV_KEY_DEFAULTS: WindowSpec[] = [
  { limit: 20, seconds: 1 },
  { limit: 100, seconds: 120 },
];

export interface WindowSpec {
  limit: number;
  seconds: number;
}

/** Parses `20:1,100:120` into window specs. */
export function parseLimitHeader(header: string | null): WindowSpec[] {
  if (!header) return [];
  const specs: WindowSpec[] = [];
  for (const part of header.split(',')) {
    const [limit, seconds] = part.split(':').map((n) => Number.parseInt(n.trim(), 10));
    if (limit !== undefined && seconds !== undefined && Number.isFinite(limit) && Number.isFinite(seconds)) {
      specs.push({ limit, seconds });
    }
  }
  return specs;
}

class SlidingWindow {
  private hits: number[] = [];

  constructor(
    public limit: number,
    public readonly seconds: number,
  ) {}

  /** Milliseconds to wait before another request fits, or 0 if there's room now. */
  waitMs(now: number): number {
    this.evict(now);
    if (this.hits.length < this.limit) return 0;
    const oldest = this.hits[0];
    if (oldest === undefined) return 0;
    return Math.max(0, oldest + this.seconds * 1000 - now);
  }

  record(now: number): void {
    this.hits.push(now);
  }

  private evict(now: number): void {
    const cutoff = now - this.seconds * 1000;
    let i = 0;
    while (i < this.hits.length && (this.hits[i] ?? Infinity) <= cutoff) i++;
    if (i > 0) this.hits.splice(0, i);
  }
}

class WindowSet {
  private windows = new Map<number, SlidingWindow>();

  constructor(specs: WindowSpec[] = []) {
    this.sync(specs);
  }

  /** Adopts limits advertised by the API, keeping existing usage counts. */
  sync(specs: WindowSpec[]): void {
    for (const spec of specs) {
      const existing = this.windows.get(spec.seconds);
      if (existing) {
        existing.limit = spec.limit;
      } else {
        this.windows.set(spec.seconds, new SlidingWindow(spec.limit, spec.seconds));
      }
    }
  }

  waitMs(now: number): number {
    let wait = 0;
    for (const window of this.windows.values()) {
      wait = Math.max(wait, window.waitMs(now));
    }
    return wait;
  }

  record(now: number): void {
    for (const window of this.windows.values()) window.record(now);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RiotRateLimiter {
  private app: WindowSet;
  private methods = new Map<string, WindowSet>();
  /** Timestamp until which everything is paused, set by 429 responses. */
  private pausedUntil = 0;
  /** Serialises the gate so concurrent callers can't all pass a stale check. */
  private chain: Promise<void> = Promise.resolve();

  constructor(defaults: WindowSpec[] = DEV_KEY_DEFAULTS) {
    this.app = new WindowSet(defaults);
  }

  private methodWindows(method: string): WindowSet {
    let set = this.methods.get(method);
    if (!set) {
      set = new WindowSet();
      this.methods.set(method, set);
    }
    return set;
  }

  /**
   * Waits until a request to `method` is allowed, then records it.
   * Calls are serialised, so the recorded slot is genuinely reserved.
   */
  async acquire(method: string): Promise<void> {
    const run = this.chain.then(() => this.gate(method));
    // Keep the chain alive even if one waiter rejects.
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async gate(method: string): Promise<void> {
    const methodWindows = this.methodWindows(method);

    // Loop rather than wait once: sleeping can push us into a different window.
    for (;;) {
      const now = Date.now();
      const waits = [
        this.pausedUntil - now,
        this.app.waitMs(now),
        methodWindows.waitMs(now),
      ];
      const wait = Math.max(0, ...waits);

      if (wait === 0) {
        this.app.record(now);
        methodWindows.record(now);
        return;
      }
      await sleep(wait);
    }
  }

  /** Adopts the limits advertised on a response. */
  observe(method: string, headers: Headers): void {
    const app = parseLimitHeader(headers.get('x-app-rate-limit'));
    if (app.length) this.app.sync(app);

    const perMethod = parseLimitHeader(headers.get('x-method-rate-limit'));
    if (perMethod.length) this.methodWindows(method).sync(perMethod);
  }

  /** Handles a 429: pauses until Riot says we may continue. */
  penalise(headers: Headers, fallbackSeconds = 1): number {
    const retryAfter = Number.parseInt(headers.get('retry-after') ?? '', 10);
    const seconds = Number.isFinite(retryAfter) ? retryAfter : fallbackSeconds;
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + seconds * 1000);
    return seconds;
  }
}
