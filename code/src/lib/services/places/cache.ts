/**
 * A tiny in-process TTL cache for provider responses.
 *
 * Generating one trip fires several searches per city, and a traveller
 * regenerating or tweaking a trip repeats many of them — without this, each
 * one is a billable Google call. Deliberately just a Map with timestamps and
 * a size cap: this is a single-server-process cache, not a distributed one,
 * and building real cache infrastructure isn't this iteration's job. Entries
 * are dropped on process restart, which is fine — the worst case is a repeat
 * upstream call.
 */
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();

  constructor(
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly maxEntries: number = MAX_ENTRIES,
  ) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh insertion order so the oldest *unused* entry is evicted first.
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Run `load` only on a miss, caching whatever it resolves to. */
  async wrap(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await load();
    this.set(key, value);
    return value;
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
