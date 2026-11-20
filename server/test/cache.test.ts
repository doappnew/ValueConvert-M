import { describe, expect, it, vi } from "vitest";
import { CachedSource, DataUnavailableError } from "../src/cache.js";

function make(opts: Partial<ConstructorParameters<typeof CachedSource<number>>[0]> & { clock: { t: number } }) {
  const fetcher = vi.fn<() => Promise<{ value: number; sourceTime: number | null }>>();
  const src = new CachedSource<number>({
    name: "test",
    ttlMs: 60_000,
    maxStaleMs: 600_000,
    sourceMaxAgeMs: 1_800_000,
    fetcher,
    now: () => opts.clock.t,
    ...opts,
  });
  return { src, fetcher };
}

describe("CachedSource", () => {
  it("sert la donnée en cache pendant le TTL sans rappeler le fournisseur", async () => {
    const clock = { t: 1_000_000 };
    const { src, fetcher } = make({ clock });
    fetcher.mockResolvedValue({ value: 1, sourceTime: clock.t });
    await src.get();
    clock.t += 30_000;
    const s = await src.get();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(s.state).toBe("live");
  });

  it("rafraîchit après le TTL", async () => {
    const clock = { t: 1_000_000 };
    const { src, fetcher } = make({ clock });
    fetcher.mockResolvedValueOnce({ value: 1, sourceTime: clock.t }).mockResolvedValueOnce({ value: 2, sourceTime: clock.t + 61_000 });
    await src.get();
    clock.t += 61_000;
    const s = await src.get();
    expect(s.value).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("regroupe les appels simultanés", async () => {
    const clock = { t: 1_000_000 };
    const { src, fetcher } = make({ clock });
    fetcher.mockResolvedValue({ value: 7, sourceTime: null });
    await Promise.all([src.get(), src.get(), src.get()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("lève DataUnavailableError sans donnée et sans fournisseur", async () => {
    const clock = { t: 1_000_000 };
    const { src, fetcher } = make({ clock });
    fetcher.mockRejectedValue(new Error("panne"));
    await expect(src.get()).rejects.toBeInstanceOf(DataUnavailableError);
  });

  it("sert une donnée périmée (stale) quand le fournisseur échoue dans la limite", async () => {
    const clock = { t: 1_000_000 };
    const { src, fetcher } = make({ clock });
    fetcher.mockResolvedValueOnce({ value: 5, sourceTime: clock.t });
    await src.get();
    clock.t += 120_000;
    fetcher.mockRejectedValue(new Error("panne"));
    const s = await src.get();
    expect(s.state).toBe("stale");
    expect(s.staleReason).toBe("refresh_failed");
    expect(s.value).toBe(5);
  });

  it("refuse la donnée trop ancienne quand le fournisseur échoue", async () => {
    const clock = { t: 1_000_000 };
    const { src, fetcher } = make({ clock });
    fetcher.mockResolvedValueOnce({ value: 5, sourceTime: clock.t });
    await src.get();
    clock.t += 700_000; // > maxStale
    fetcher.mockRejectedValue(new Error("panne"));
    await expect(src.get()).rejects.toBeInstanceOf(DataUnavailableError);
  });

  it("signale « source_old » si le fournisseur renvoie une donnée ancienne", async () => {
    const clock = { t: 10_000_000 };
    const { src, fetcher } = make({ clock });
    fetcher.mockResolvedValue({ value: 3, sourceTime: clock.t - 2_000_000 });
    const s = await src.get();
    expect(s.state).toBe("stale");
    expect(s.staleReason).toBe("source_old");
  });

  it("appelle onError à chaque échec", async () => {
    const clock = { t: 1_000_000 };
    const onError = vi.fn();
    const { src, fetcher } = make({ clock, onError });
    fetcher.mockRejectedValue(new Error("x"));
    await src.get().catch(() => undefined);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
