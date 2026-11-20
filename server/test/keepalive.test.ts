import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inWindow, startKeepAlive } from "../src/keepalive.js";

const TZ = "America/Los_Angeles";

describe("plage horaire (9 h – 17 h, Los Angeles)", () => {
  it("hiver : 9 h LA = 17 h UTC ; 17 h LA = 01 h UTC (= 18 h – 2 h au Bénin)", () => {
    expect(inWindow(new Date("2026-11-20T16:59:00Z"), TZ, 9, 17)).toBe(false); // 8 h 59 LA
    expect(inWindow(new Date("2026-11-20T17:00:00Z"), TZ, 9, 17)).toBe(true); // 9 h LA
    expect(inWindow(new Date("2026-11-21T00:59:00Z"), TZ, 9, 17)).toBe(true); // 16 h 59 LA
    expect(inWindow(new Date("2026-11-21T01:00:00Z"), TZ, 9, 17)).toBe(false); // 17 h LA
  });
  it("été : l'heure américaine change, la plage suit (9 h LA = 16 h UTC)", () => {
    expect(inWindow(new Date("2026-07-20T15:59:00Z"), TZ, 9, 17)).toBe(false);
    expect(inWindow(new Date("2026-07-20T16:00:00Z"), TZ, 9, 17)).toBe(true);
    expect(inWindow(new Date("2026-07-21T00:00:00Z"), TZ, 9, 17)).toBe(false); // 17 h LA
  });
  it("actif tous les jours, week-ends compris", () => {
    expect(inWindow(new Date("2026-11-21T20:00:00Z"), TZ, 9, 17)).toBe(true); // samedi
    expect(inWindow(new Date("2026-11-22T20:00:00Z"), TZ, 9, 17)).toBe(true); // dimanche
  });
});

describe("startKeepAlive", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ne fait rien sans RENDER_EXTERNAL_URL", () => {
    const f = vi.fn();
    expect(startKeepAlive(undefined, f as unknown as typeof fetch)).toBeNull();
    expect(startKeepAlive("", f as unknown as typeof fetch)).toBeNull();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(f).not.toHaveBeenCalled();
  });

  it("appelle /api/health toutes les 5 minutes dans la plage, sans corps", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const f = vi.fn().mockRejectedValue(new Error("réseau"));
    const t = startKeepAlive("https://exemple.onrender.com/", f as unknown as typeof fetch, { now: () => new Date("2026-11-20T20:00:00Z") });
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://exemple.onrender.com/api/health");
    expect(init.body).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(f).toHaveBeenCalledTimes(2);
    clearInterval(t!);
  });

  it("n'appelle rien hors de la plage", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const f = vi.fn().mockResolvedValue(new Response("{}"));
    const t = startKeepAlive("https://exemple.onrender.com", f as unknown as typeof fetch, { now: () => new Date("2026-11-21T03:00:00Z") }); // 19 h LA
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(f).not.toHaveBeenCalled();
    clearInterval(t!);
  });
});
