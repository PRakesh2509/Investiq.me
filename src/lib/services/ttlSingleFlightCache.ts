/**
 * Bounded TTL cache with single-flight de-duplication.
 *
 * Designed for Cloudflare Workers: no timers at module load, no background work.
 * Module memory is a best-effort optimisation only (isolates are ephemeral and run in
 * parallel), so every consumer must remain correct when the cache is always cold.
 *
 * - Fresh entries (age < ttl) are returned without recomputation.
 * - Concurrent callers for the same key share ONE in-flight computation (single-flight).
 * - A leader whose request was cancelled can leave a promise that never settles, so
 *   followers stop waiting after `followerTimeoutMs` and in-flight entries older than
 *   `maxInflightAgeMs` are ignored.
 * - The number of stored entries is capped (oldest evicted first).
 */

export interface TtlSingleFlightCacheOptions {
  ttlMs: number;
  maxEntries: number;
  /** How long followers wait for a shared in-flight computation before computing on their own. */
  followerTimeoutMs?: number;
  /** In-flight computations older than this are considered lost and are replaced. */
  maxInflightAgeMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface CacheReadOptions {
  forceRefresh?: boolean;
  /** Override the default TTL for this read. */
  ttlMs?: number;
}

interface Entry<V> {
  value: V;
  storedAt: number;
}

interface Inflight<V> {
  promise: Promise<V>;
  startedAt: number;
}

export class TtlSingleFlightCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly inflight = new Map<string, Inflight<V>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly followerTimeoutMs: number;
  private readonly maxInflightAgeMs: number;
  private readonly now: () => number;

  /** Number of times `compute` was actually invoked (useful for tests / metrics). */
  public computeCount = 0;

  constructor(opts: TtlSingleFlightCacheOptions) {
    this.ttlMs = opts.ttlMs;
    this.maxEntries = Math.max(1, opts.maxEntries);
    this.followerTimeoutMs = opts.followerTimeoutMs ?? 10_000;
    this.maxInflightAgeMs = opts.maxInflightAgeMs ?? 20_000;
    this.now = opts.now ?? Date.now;
  }

  public get size(): number {
    return this.entries.size;
  }

  public get inflightCount(): number {
    return this.inflight.size;
  }

  /** Return the stored value (even if expired) together with its age in ms. */
  public peek(key: string): { value: V; ageMs: number } | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    return { value: e.value, ageMs: Math.max(0, this.now() - e.storedAt) };
  }

  public clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }

  public set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, storedAt: this.now() });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /**
   * Return a fresh cached value, join an in-flight computation, or compute a new value.
   */
  public async getOrCompute(
    key: string,
    compute: () => Promise<V>,
    opts: CacheReadOptions = {},
  ): Promise<V> {
    const ttl = opts.ttlMs ?? this.ttlMs;
    const nowMs = this.now();

    if (!opts.forceRefresh) {
      const hit = this.entries.get(key);
      if (hit && nowMs - hit.storedAt < ttl) return hit.value;
    }

    const existing = this.inflight.get(key);
    if (existing && nowMs - existing.startedAt < this.maxInflightAgeMs) {
      try {
        return await this.waitFor(existing.promise);
      } catch (err) {
        if (err instanceof FollowerTimeoutError) {
          // Leader appears stuck; fall through and compute independently.
        } else {
          throw err;
        }
      }
    }

    this.computeCount++;
    const promise = compute().then((value) => {
      this.set(key, value);
      return value;
    });
    const record: Inflight<V> = { promise, startedAt: nowMs };
    this.inflight.set(key, record);
    const cleanup = () => {
      if (this.inflight.get(key) === record) this.inflight.delete(key);
    };
    promise.then(cleanup, cleanup);
    return promise;
  }

  private waitFor(promise: Promise<V>): Promise<V> {
    return new Promise<V>((resolve, reject) => {
      const timer = setTimeout(() => reject(new FollowerTimeoutError()), this.followerTimeoutMs);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }
}

class FollowerTimeoutError extends Error {
  constructor() {
    super("Timed out waiting for shared in-flight computation");
  }
}
