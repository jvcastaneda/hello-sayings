export interface Saying {
  id: string;
  text: string;
}

export interface SayingsStore {
  list(): Promise<Saying[]>;
  get(id: string): Promise<Saying | undefined>;
  // Create or replace; resolves true if the saying is new
  put(id: string, text: string): Promise<boolean>;
  // Resolves false if there was nothing to delete
  delete(id: string): Promise<boolean>;
  // Throws if the backend is unreachable; used by the readiness probe
  ping(): Promise<void>;
}

// Serves random sayings and the stored count from a periodically refreshed copy
// of the full list, so GET / doesn't scan the table on every request
export class Snapshot {
  private sayings: Saying[] = [];
  private fetchedAt = 0;
  private inflight?: Promise<Saying[]>;

  constructor(private readonly store: SayingsStore, private readonly ttlMs: number) {}

  async all(): Promise<Saying[]> {
    if (Date.now() - this.fetchedAt < this.ttlMs) return this.sayings;
    // Concurrent callers share one refresh
    this.inflight ??= this.store
      .list()
      .then((sayings) => {
        this.sayings = sayings;
        this.fetchedAt = Date.now();
        return sayings;
      })
      .finally(() => {
        this.inflight = undefined;
      });
    return this.inflight;
  }

  async random(): Promise<Saying | undefined> {
    const all = await this.all();
    return all.length === 0 ? undefined : all[Math.floor(Math.random() * all.length)];
  }

  // Forces the next read to refresh, so a writer sees its own change
  invalidate() {
    this.fetchedAt = 0;
  }
}
