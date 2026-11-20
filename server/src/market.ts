import { CachedSource, DataUnavailableError, type DataState, type Snapshot } from "./cache.js";
import { CURRENCIES, getCurrency, type Currency } from "./currencies.js";
import {
  DecimalCtor,
  fiatToPi,
  parseAmount,
  piToFiat,
  roundForCurrency,
  roundForPi,
  toDecimal,
} from "./convert.js";
import { AppError } from "./errors.js";
import type { PriceQuote } from "./providers/coingecko.js";
import type { FxTable } from "./providers/fxrates.js";

export type Direction = "pi_to_fiat" | "fiat_to_pi";

export interface ConvertRequest {
  direction: Direction;
  amount: string;
  currency: string;
}

export interface SourceInfo {
  name: string;
  state: DataState | "unavailable";
  staleReason?: string;
  /** Heure annoncée par le fournisseur (ISO 8601) */
  sourceUpdatedAt: string | null;
  /** Dernier appel réussi (ISO 8601) */
  fetchedAt: string | null;
  attribution: { text: string; url: string };
}

export interface ConvertResponse {
  direction: Direction;
  amount: string;
  currency: { code: string; name: string; decimals: number };
  result: string;
  resultPrecise: string;
  /** Prix de 1 Pi en USD utilisé (cotation de marché). */
  priceUsd: string;
  /** Taux « 1 USD = x devise » utilisé. */
  usdToFiat: string;
  /** Prix de 1 Pi dans la devise choisie. */
  unitPriceFiat: string;
  sources: { price: SourceInfo | null; fx: SourceInfo | null };
  /** « live » si toutes les données utilisées sont à jour, « stale » sinon. */
  dataState: DataState;
  disclaimer: string;
}

export interface StatusResponse {
  env: string;
  /** null tant que la valeur du Pi n'est pas disponible : la source de prix n'est alors pas interrogée. */
  price: SourceInfo | null;
  fx: SourceInfo;
}

const PRICE_ATTRIBUTION = { text: "Prix : CoinGecko", url: "https://www.coingecko.com" };
const FX_ATTRIBUTION = { text: "Rates By Exchange Rate API", url: "https://www.exchangerate-api.com" };

const DISCLAIMER_MARKET =
  "Estimation indicative basée sur des cotations externes ; ce n'est ni un prix garanti ni une conversion exécutable.";

export interface MarketDeps {
  price: CachedSource<PriceQuote>;
  fx: CachedSource<FxTable>;
  envName: string;
}

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

function infoFrom(
  name: string,
  attribution: { text: string; url: string },
  snap: Snapshot<unknown> | null,
): SourceInfo {
  if (!snap) {
    return { name, state: "unavailable", sourceUpdatedAt: null, fetchedAt: null, attribution };
  }
  const info: SourceInfo = {
    name,
    state: snap.state,
    sourceUpdatedAt: iso(snap.sourceTime),
    fetchedAt: iso(snap.fetchedAt),
    attribution,
  };
  if (snap.staleReason) info.staleReason = snap.staleReason;
  return info;
}

export function createMarketService(deps: MarketDeps) {
  async function loadPrice(): Promise<Snapshot<PriceQuote>> {
    try {
      return await deps.price.get();
    } catch (e) {
      if (e instanceof DataUnavailableError) {
        throw new AppError(
          "PRICE_UNAVAILABLE",
          "Le prix du Pi est indisponible pour le moment. Aucun résultat de marché n'est affiché.",
          503,
        );
      }
      throw e;
    }
  }

  async function loadFx(): Promise<Snapshot<FxTable>> {
    try {
      return await deps.fx.get();
    } catch (e) {
      if (e instanceof DataUnavailableError) {
        throw new AppError(
          "RATES_UNAVAILABLE",
          "Les taux de change sont indisponibles pour le moment. Aucun résultat n'est affiché.",
          503,
        );
      }
      throw e;
    }
  }

  async function convert(req: ConvertRequest): Promise<ConvertResponse> {
    const currency: Currency | undefined = getCurrency(req.currency);
    if (!currency) {
      throw new AppError("UNSUPPORTED_CURRENCY", `Devise non prise en charge : ${req.currency}.`, 400);
    }
    const amount = parseAmount(req.amount);

    const priceSnap: Snapshot<PriceQuote> = await loadPrice();
    const priceUsd = toDecimal(priceSnap.value.priceUsd);

    let fxSnap: Snapshot<FxTable> | null = null;
    let rate = new DecimalCtor(1);
    if (currency.code !== "USD") {
      fxSnap = await loadFx();
      const raw = fxSnap.value.rates[currency.code];
      if (raw === undefined) {
        throw new AppError(
          "CURRENCY_UNAVAILABLE",
          `La devise ${currency.code} n'est pas fournie par la source de taux pour le moment.`,
          422,
        );
      }
      rate = toDecimal(raw);
    }

    const rounded =
      req.direction === "pi_to_fiat"
        ? roundForCurrency(piToFiat(amount, priceUsd, rate), currency)
        : roundForPi(fiatToPi(amount, priceUsd, rate));

    const stale = priceSnap.state === "stale" || fxSnap?.state === "stale";
    return {
      direction: req.direction,
      amount: amount.toFixed(),
      currency: { code: currency.code, name: currency.name, decimals: currency.decimals },
      result: rounded.result,
      resultPrecise: rounded.resultPrecise,
      priceUsd: priceUsd.toFixed(),
      usdToFiat: rate.toFixed(),
      unitPriceFiat: priceUsd.times(rate).toDecimalPlaces(Math.max(currency.decimals, 2)).toFixed(),
      sources: {
        price: infoFrom("CoinGecko", PRICE_ATTRIBUTION, priceSnap),
        fx: fxSnap ? infoFrom("ExchangeRate-API", FX_ATTRIBUTION, fxSnap) : null,
      },
      dataState: stale ? "stale" : "live",
      disclaimer: DISCLAIMER_MARKET,
    };
  }

  async function status(opts: { withPrice: boolean } = { withPrice: true }): Promise<StatusResponse> {
    const [p, f] = await Promise.all([
      opts.withPrice ? deps.price.get().catch(() => null) : Promise.resolve(null),
      deps.fx.get().catch(() => null),
    ]);
    return {
      env: deps.envName,
      price: opts.withPrice ? infoFrom("CoinGecko", PRICE_ATTRIBUTION, p) : null,
      fx: infoFrom("ExchangeRate-API", FX_ATTRIBUTION, f),
    };
  }

  return { convert, status, currencies: CURRENCIES };
}

export type MarketService = ReturnType<typeof createMarketService>;
