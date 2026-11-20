import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { CachedSource } from "../src/cache.js";
import { loadConfig } from "../src/config.js";
import { createMarketService } from "../src/market.js";
import type { PriceQuote } from "../src/providers/coingecko.js";
import type { FxTable } from "../src/providers/fxrates.js";

const NOW = Date.parse("2026-11-19T12:00:00Z");

function setup(opts: {
  price?: () => Promise<{ value: PriceQuote; sourceTime: number | null }>;
  fx?: () => Promise<{ value: FxTable; sourceTime: number | null }>;
  env?: Record<string, string>;
  fetchFn?: typeof fetch;
} = {}) {
  const config = loadConfig({ PI_VALUE_AVAILABLE: "1", CLIENT_DIST: "/nonexistent", ...opts.env });
  const price = new CachedSource<PriceQuote>({
    name: "CoinGecko",
    ttlMs: 60_000,
    maxStaleMs: 900_000,
    sourceMaxAgeMs: 1_800_000,
    now: () => NOW,
    fetcher: opts.price ?? (async () => ({ value: { priceUsd: "0.2" }, sourceTime: NOW - 30_000 })),
  });
  const fx = new CachedSource<FxTable>({
    name: "ExchangeRate-API",
    ttlMs: 3_600_000,
    maxStaleMs: 172_800_000,
    sourceMaxAgeMs: 129_600_000,
    now: () => NOW,
    fetcher:
      opts.fx ??
      (async () => ({
        value: { rates: { USD: "1", XOF: "600", EUR: "0.9", TND: "3" } },
        sourceTime: NOW - 3_600_000,
      })),
  });
  const market = createMarketService({ price, fx, envName: config.APP_ENV });
  return createApp({ config, market, ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}) });
}

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

describe("GET /api/convert — mode marché", () => {
  it("Pi → XOF fonctionne", async () => {
    const res = await request(setup()).get(`/api/convert?${q({ direction: "pi_to_fiat", amount: "100", currency: "XOF" })}`);
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("12000"); // 100 × 0,2 × 600
    expect(res.body.currency.code).toBe("XOF");
    expect(res.body.dataState).toBe("live");
    expect(res.body.sources.price.name).toBe("CoinGecko");
    expect(res.body.sources.fx.attribution.text).toBe("Rates By Exchange Rate API");
    expect(res.body.priceUsd).toBe("0.2");
    expect(res.body.usdToFiat).toBe("600");
  });

  it("XOF → Pi utilise les mêmes références", async () => {
    const res = await request(setup()).get(`/api/convert?${q({ direction: "fiat_to_pi", amount: "12000", currency: "XOF" })}`);
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("100.0000000");
  });

  it("USD n'a pas besoin de la source de taux", async () => {
    const fx = vi.fn().mockRejectedValue(new Error("panne"));
    const res = await request(setup({ fx })).get(`/api/convert?${q({ direction: "pi_to_fiat", amount: "10", currency: "USD" })}`);
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("2.00");
    expect(res.body.sources.fx).toBeNull();
  });

  it("arrondit selon les décimales de la devise (TND : 3)", async () => {
    const res = await request(setup()).get(`/api/convert?${q({ direction: "pi_to_fiat", amount: "1.2345", currency: "tnd" })}`);
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("0.741"); // 1,2345 × 0,2 × 3 = 0,7407
  });
});

describe("erreurs et indisponibilités", () => {
  it("devise non prise en charge → message clair", async () => {
    const res = await request(setup()).get(`/api/convert?${q({ direction: "pi_to_fiat", amount: "1", currency: "XYZ" })}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNSUPPORTED_CURRENCY");
    expect(res.body.error.message).toMatch(/non prise en charge/);
  });

  it("devise absente de la source de taux → 422", async () => {
    const res = await request(setup()).get(`/api/convert?${q({ direction: "pi_to_fiat", amount: "1", currency: "NGN" })}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("CURRENCY_UNAVAILABLE");
    expect(res.body.result).toBeUndefined();
  });

  it("prix indisponible → 503 sans aucun prix inventé", async () => {
    const price = vi.fn().mockRejectedValue(new Error("panne"));
    const res = await request(setup({ price })).get(`/api/convert?${q({ direction: "pi_to_fiat", amount: "1", currency: "XOF" })}`);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("PRICE_UNAVAILABLE");
    expect(JSON.stringify(res.body)).not.toMatch(/priceUsd|result"/);
  });

  it("taux indisponibles → 503", async () => {
    const fx = vi.fn().mockRejectedValue(new Error("panne"));
    const res = await request(setup({ fx })).get(`/api/convert?${q({ direction: "pi_to_fiat", amount: "1", currency: "XOF" })}`);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("RATES_UNAVAILABLE");
  });

  it.each([
    ["montant négatif", { amount: "-1" }],
    ["montant texte", { amount: "abc" }],
    ["montant zéro", { amount: "0" }],
    ["montant énorme", { amount: "99999999999999999" }],
    ["sens invalide", { direction: "sideways" }],
    ["devise mal formée", { currency: "XO" }],
  ])("entrée invalide : %s → 400", async (_l, patch) => {
    const params = { direction: "pi_to_fiat", amount: "1", currency: "XOF", ...patch };
    const res = await request(setup()).get(`/api/convert?${q(params)}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toMatch(/INVALID_INPUT|UNSUPPORTED_CURRENCY/);
  });

  it("paramètres manquants → 400", async () => {
    const res = await request(setup()).get("/api/convert");
    expect(res.status).toBe(400);
  });

  it("signale les données périmées (stale) quand CoinGecko tombe après un succès", async () => {
    let calls = 0;
    let now = NOW;
    const config = loadConfig({ CLIENT_DIST: "/nonexistent", PI_VALUE_AVAILABLE: "1" });
    const price = new CachedSource<PriceQuote>({
      name: "CoinGecko",
      ttlMs: 60_000,
      maxStaleMs: 900_000,
      sourceMaxAgeMs: 1_800_000,
      now: () => now,
      fetcher: async () => {
        calls++;
        if (calls > 1) throw new Error("panne");
        return { value: { priceUsd: "0.2" }, sourceTime: now };
      },
    });
    const fx = new CachedSource<FxTable>({
      name: "fx",
      ttlMs: 3_600_000,
      maxStaleMs: 172_800_000,
      sourceMaxAgeMs: 129_600_000,
      now: () => now,
      fetcher: async () => ({ value: { rates: { XOF: "600" } }, sourceTime: now }),
    });
    const app = createApp({ config, market: createMarketService({ price, fx, envName: "mainnet" }) });
    const url = `/api/convert?${q({ direction: "pi_to_fiat", amount: "1", currency: "XOF" })}`;
    expect((await request(app).get(url)).body.dataState).toBe("live");
    now += 120_000;
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    expect(res.body.dataState).toBe("stale");
    expect(res.body.sources.price.state).toBe("stale");
    now += 1_000_000;
    expect((await request(app).get(url)).status).toBe(503);
  });
});

describe("autres routes", () => {
  it("/api/currencies liste au moins 25 devises, SLE et non SLL", async () => {
    const res = await request(setup()).get("/api/currencies");
    const codes = res.body.currencies.map((c: { code: string }) => c.code);
    expect(codes.length).toBeGreaterThanOrEqual(25);
    expect(codes).toContain("XOF");
    expect(codes).toContain("SLE");
    expect(codes).not.toContain("SLL");
  });

  it("/api/status indique l'état des deux sources, même en panne", async () => {
    const price = vi.fn().mockRejectedValue(new Error("panne"));
    const res = await request(setup({ price })).get("/api/status");
    expect(res.status).toBe(200);
    expect(res.body.price.state).toBe("unavailable");
    expect(res.body.fx.state).toBe("live");
    expect(res.body.env).toBe("mainnet");
  });

  it("/api/config expose l'environnement et la disponibilité de la valeur du Pi", async () => {
    const res = await request(setup({ env: { APP_ENV: "mainnet" } })).get("/api/config");
    expect(res.body).toEqual({ appName: "ValueConvert", env: "mainnet", piValueAvailable: true, piSandbox: false });
  });

  it("aucune route de test n'existe en Mainnet (404)", async () => {
    const app = setup();
    for (const [method, path] of [
      ["get", "/api/test/status"],
      ["get", "/api/test/me"],
      ["post", "/api/test/send"],
      ["post", "/api/test/receive/approve"],
      ["post", "/api/test/receive/complete"],
    ] as const) {
      const res = await request(app)[method](path);
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it("route inconnue → 404 JSON", async () => {
    const res = await request(setup()).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("/validation-key.txt renvoie la clé configurée, sinon 404", async () => {
    const withKey = await request(setup({ env: { PI_VALIDATION_KEY: "abc123" } })).get("/validation-key.txt");
    expect(withKey.status).toBe(200);
    expect(withKey.text).toBe("abc123");
    const without = await request(setup()).get("/validation-key.txt");
    expect(without.status).toBe(404);
  });

  it("en-têtes de sécurité présents, sans X-Powered-By", async () => {
    const res = await request(setup()).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toContain("script-src 'self' https://sdk.minepi.com");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("limite les requêtes (429)", async () => {
    const app = setup({ env: { RATE_LIMIT_PER_MINUTE: "3" } });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await request(app).get("/api/health")).status);
    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes).toContain(429);
  });
});

describe("POST /api/pi/verify", () => {
  let fetchFn: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchFn = vi.fn();
  });
  const post = (body: unknown = { accessToken: "token-token-token" }) =>
    request(setup({ fetchFn: fetchFn as unknown as typeof fetch })).post("/api/pi/verify").send(body as object);

  it("200 : vérifie le jeton avec GET /v2/me et ne renvoie que le nom d'utilisateur", async () => {
    fetchFn.mockResolvedValue(new Response(JSON.stringify({ uid: "u-1", username: "alice", secret: "x" }), { status: 200 }));
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: "alice" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.minepi.com/v2/me");
    expect(init.method ?? "GET").toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-token-token");
  });

  it("401 : jeton refusé par Pi → « Jeton Pi refusé »", async () => {
    fetchFn.mockResolvedValue(new Response("{}", { status: 401 }));
    const res = await post({ accessToken: "mauvais-jeton-xx" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(res.body.error.message).toBe("Jeton Pi refusé.");
  });

  it("403 : jeton refusé par Pi", async () => {
    fetchFn.mockResolvedValue(new Response("{}", { status: 403 }));
    expect((await post()).status).toBe(401);
  });

  it("503 : erreur Pi → 502, sans aucun autre appel", async () => {
    fetchFn.mockResolvedValue(new Response("{}", { status: 503 }));
    const res = await post();
    expect(res.status).toBe(502);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("n'envoie jamais le jeton à une autre adresse que api.minepi.com", async () => {
    fetchFn.mockResolvedValue(new Response(JSON.stringify({ uid: "u-1", username: "alice" }), { status: 200 }));
    await post();
    for (const call of fetchFn.mock.calls as [string][]) expect(new URL(call[0]).hostname).toBe("api.minepi.com");
  });

  it("refuse un corps invalide sans appeler Pi", async () => {
    const res = await post({ accessToken: "x" });
    expect(res.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("502 si Pi est injoignable ou renvoie un format inattendu", async () => {
    fetchFn.mockRejectedValue(new Error("réseau"));
    expect((await post()).status).toBe(502);
    fetchFn.mockReset();
    fetchFn.mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200 }));
    expect((await post()).status).toBe(502);
  });
});

describe("valeur du Pi à venir (PI_VALUE_AVAILABLE=0, par défaut)", () => {
  it("ne calcule rien et n'interroge aucune source de prix", async () => {
    const price = vi.fn().mockResolvedValue({ value: { priceUsd: "0.2" }, sourceTime: NOW });
    const app = setup({ price, env: { PI_VALUE_AVAILABLE: "0" } });
    const res = await request(app).get(`/api/convert?${q({ direction: "pi_to_fiat", amount: "100", currency: "XOF" })}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, message: expect.stringMatching(/à venir/) });
    expect(JSON.stringify(res.body)).not.toMatch(/314159|result|priceUsd/);
    const st = await request(app).get("/api/status");
    expect(st.body.price).toBeNull();
    expect(price).not.toHaveBeenCalled();
    expect((await request(app).get("/api/config")).body.piValueAvailable).toBe(false);
  });
});
