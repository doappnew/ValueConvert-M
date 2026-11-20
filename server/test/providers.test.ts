import { describe, expect, it } from "vitest";
import { fetchPiPriceUsd } from "../src/providers/coingecko.js";
import { fetchUsdRates } from "../src/providers/fxrates.js";
import { ProviderError } from "../src/errors.js";

function jsonFetch(body: unknown, init: { status?: number } = {}): typeof fetch {
  return (async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

const cgBase = { baseUrl: "https://api.coingecko.com/api/v3", keyHeader: "x-cg-demo-api-key", coinId: "pi-network" };

describe("CoinGecko", () => {
  it("lit le prix et l'heure de mise à jour", async () => {
    const r = await fetchPiPriceUsd({
      ...cgBase,
      fetchFn: jsonFetch({ "pi-network": { usd: 0.1731, last_updated_at: 1_790_000_000 } }),
    });
    expect(r.value.priceUsd).toBe("0.1731");
    expect(r.sourceTime).toBe(1_790_000_000_000);
  });

  it("envoie la clé dans l'en-tête configuré et demande le bon actif", async () => {
    let seen: { url: string; headers: Record<string, string> } | null = null;
    const fetchFn = (async (url: URL, init: RequestInit) => {
      seen = { url: String(url), headers: init.headers as Record<string, string> };
      return new Response(JSON.stringify({ "pi-network": { usd: 0.2 } }), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchPiPriceUsd({ ...cgBase, apiKey: "SECRET", fetchFn });
    expect(seen!.url).toContain("ids=pi-network");
    expect(seen!.url).toContain("vs_currencies=usd");
    expect(seen!.headers["x-cg-demo-api-key"]).toBe("SECRET");
  });

  it("accepte l'absence d'heure de source", async () => {
    const r = await fetchPiPriceUsd({ ...cgBase, fetchFn: jsonFetch({ "pi-network": { usd: 0.2 } }) });
    expect(r.sourceTime).toBeNull();
  });

  it.each([
    ["actif absent", {}],
    ["prix nul", { "pi-network": { usd: 0 } }],
    ["prix négatif", { "pi-network": { usd: -1 } }],
    ["prix texte", { "pi-network": { usd: "0.2" } }],
    ["prix aberrant", { "pi-network": { usd: 1e12 } }],
    ["format inattendu", [1, 2, 3]],
  ])("refuse : %s", async (_label, body) => {
    await expect(fetchPiPriceUsd({ ...cgBase, fetchFn: jsonFetch(body) })).rejects.toBeInstanceOf(ProviderError);
  });

  it("signale la limite d'appels (429) et les erreurs HTTP", async () => {
    await expect(fetchPiPriceUsd({ ...cgBase, fetchFn: jsonFetch({}, { status: 429 }) })).rejects.toThrow(/429/);
    await expect(fetchPiPriceUsd({ ...cgBase, fetchFn: jsonFetch({}, { status: 500 }) })).rejects.toThrow(/500/);
  });

  it("refuse une réponse non JSON et une panne réseau", async () => {
    await expect(fetchPiPriceUsd({ ...cgBase, fetchFn: jsonFetch("<html>") })).rejects.toThrow(/non JSON/);
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(fetchPiPriceUsd({ ...cgBase, fetchFn: down })).rejects.toThrow(/injoignable/);
  });

  it("refuse la fiche IOU", async () => {
    await expect(
      fetchPiPriceUsd({ ...cgBase, coinId: "pi-network-iou", fetchFn: jsonFetch({ "pi-network-iou": { usd: 41 } }) }),
    ).rejects.toThrow(/IOU/);
  });
});

describe("Taux de change", () => {
  const ok = {
    result: "success",
    time_last_update_unix: 1_790_000_000,
    rates: { USD: 1, XOF: 596.371316, EUR: 0.909215, BAD: -2, ZZZ: "x", abc: 3 },
  };

  it("lit les taux valides et ignore les invalides", async () => {
    const r = await fetchUsdRates({ url: "https://x", fetchFn: jsonFetch(ok) });
    expect(r.value.rates.XOF).toBe("596.371316");
    expect(r.value.rates.BAD).toBeUndefined();
    expect(r.value.rates.ZZZ).toBeUndefined();
    expect(r.value.rates.abc).toBeUndefined();
    expect(r.sourceTime).toBe(1_790_000_000_000);
  });

  it.each([
    ["result error", { ...ok, result: "error" }],
    ["sans heure", { result: "success", rates: { XOF: 600 } }],
    ["sans taux valide", { ...ok, rates: { XOF: 0 } }],
    ["format inattendu", "{}"],
  ])("refuse : %s", async (_l, body) => {
    await expect(fetchUsdRates({ url: "https://x", fetchFn: jsonFetch(body) })).rejects.toBeInstanceOf(ProviderError);
  });

  it("signale 429 et la panne réseau", async () => {
    await expect(fetchUsdRates({ url: "https://x", fetchFn: jsonFetch({}, { status: 429 }) })).rejects.toThrow(/429/);
    const down = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    await expect(fetchUsdRates({ url: "https://x", fetchFn: down })).rejects.toThrow(/injoignable/);
  });
});
