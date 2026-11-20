export type DataState = "live" | "stale";
export type StaleReason = "refresh_failed" | "source_old";

export interface Snapshot<T> {
  value: T;
  state: DataState;
  staleReason?: StaleReason;
  /** Instant (ms) du dernier appel réussi au fournisseur. */
  fetchedAt: number;
  /** Instant (ms) annoncé par le fournisseur pour sa donnée, s'il existe. */
  sourceTime: number | null;
}

export interface FetchResult<T> {
  value: T;
  sourceTime: number | null;
}

export interface SourceOptions<T> {
  name: string;
  /** Durée pendant laquelle une donnée est servie sans rappeler le fournisseur. */
  ttlMs: number;
  /** Âge maximal (depuis le dernier succès) d'une donnée encore servie quand le fournisseur échoue. */
  maxStaleMs: number;
  /** Au-delà, la donnée du fournisseur est signalée comme périmée même si l'appel a réussi. */
  sourceMaxAgeMs: number;
  fetcher: () => Promise<FetchResult<T>>;
  now?: () => number;
  onError?: (error: unknown) => void;
}

export class DataUnavailableError extends Error {
  constructor(
    public readonly sourceName: string,
    public override readonly cause?: unknown,
  ) {
    super(`Source indisponible : ${sourceName}`);
    this.name = "DataUnavailableError";
  }
}

/**
 * Source de données avec cache, regroupement des appels simultanés et gestion de la péremption.
 * Jamais de valeur inventée : sans donnée valide, `get()` lève DataUnavailableError.
 */
export class CachedSource<T> {
  private entry: { value: T; fetchedAt: number; sourceTime: number | null } | null = null;
  private inflight: Promise<Snapshot<T>> | null = null;
  private readonly now: () => number;

  constructor(private readonly opts: SourceOptions<T>) {
    this.now = opts.now ?? Date.now;
  }

  get name(): string {
    return this.opts.name;
  }

  get(): Promise<Snapshot<T>> {
    if (this.entry && this.now() - this.entry.fetchedAt < this.opts.ttlMs) {
      return Promise.resolve(this.snapshot(false));
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.refresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async refresh(): Promise<Snapshot<T>> {
    try {
      const r = await this.opts.fetcher();
      this.entry = { value: r.value, fetchedAt: this.now(), sourceTime: r.sourceTime };
      return this.snapshot(false);
    } catch (error) {
      this.opts.onError?.(error);
      if (this.entry && this.now() - this.entry.fetchedAt <= this.opts.maxStaleMs) {
        return this.snapshot(true);
      }
      throw new DataUnavailableError(this.opts.name, error);
    }
  }

  private snapshot(refreshFailed: boolean): Snapshot<T> {
    const e = this.entry;
    if (!e) throw new DataUnavailableError(this.opts.name);
    const sourceOld = e.sourceTime !== null && this.now() - e.sourceTime > this.opts.sourceMaxAgeMs;
    const snap: Snapshot<T> = {
      value: e.value,
      state: refreshFailed || sourceOld ? "stale" : "live",
      fetchedAt: e.fetchedAt,
      sourceTime: e.sourceTime,
    };
    if (refreshFailed) snap.staleReason = "refresh_failed";
    else if (sourceOld) snap.staleReason = "source_old";
    return snap;
  }
}
