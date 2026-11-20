import { createApp } from "./app.js";
import { CachedSource } from "./cache.js";
import { loadConfig } from "./config.js";
import { startKeepAlive } from "./keepalive.js";
import { createMarketService } from "./market.js";
import { fetchPiPriceUsd } from "./providers/coingecko.js";
import { fetchUsdRates } from "./providers/fxrates.js";

const config = loadConfig();

const price = new CachedSource({
  name: "CoinGecko",
  ttlMs: config.PRICE_TTL_SECONDS * 1000,
  maxStaleMs: config.PRICE_MAX_STALE_SECONDS * 1000,
  sourceMaxAgeMs: config.PRICE_SOURCE_MAX_AGE_SECONDS * 1000,
  fetcher: () =>
    fetchPiPriceUsd({
      baseUrl: config.COINGECKO_BASE_URL,
      apiKey: config.COINGECKO_API_KEY,
      keyHeader: config.COINGECKO_KEY_HEADER,
      coinId: config.COINGECKO_COIN_ID,
    }),
  // Journal technique : message court, jamais la clé ni la réponse complète.
  onError: (e) => console.warn("[prix]", e instanceof Error ? e.message : "échec"),
});

const fx = new CachedSource({
  name: "ExchangeRate-API",
  ttlMs: config.FX_TTL_SECONDS * 1000,
  maxStaleMs: config.FX_MAX_STALE_SECONDS * 1000,
  sourceMaxAgeMs: config.FX_SOURCE_MAX_AGE_SECONDS * 1000,
  fetcher: () => fetchUsdRates({ url: config.FX_URL }),
  onError: (e) => console.warn("[taux]", e instanceof Error ? e.message : "échec"),
});

const market = createMarketService({ price, fx, envName: config.APP_ENV });
const app = createApp({ config, market });

const server = app.listen(config.PORT, () => {
  console.log(`ValueConvert (${config.APP_ENV}) à l'écoute sur le port ${config.PORT}`);
});

startKeepAlive(process.env.RENDER_EXTERNAL_URL);

function shutdown(signal: string) {
  console.log(`${signal} reçu, arrêt en cours…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
