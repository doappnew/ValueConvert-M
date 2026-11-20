import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startKeepAlive } from "../src/keepalive.js";

describe("startKeepAlive", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ne fait rien sans RENDER_EXTERNAL_URL", () => {
    const fetchFn = vi.fn();
    expect(startKeepAlive(undefined, fetchFn as unknown as typeof fetch)).toBeNull();
    expect(startKeepAlive("", fetchFn as unknown as typeof fetch)).toBeNull();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("appelle /api/health toutes les 5 minutes, sans corps ni erreur visible", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("réseau"));
    const timer = startKeepAlive("https://exemple.onrender.com/", fetchFn as unknown as typeof fetch);
    expect(fetchFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://exemple.onrender.com/api/health");
    expect(init.body).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    clearInterval(timer!);
  });
});
