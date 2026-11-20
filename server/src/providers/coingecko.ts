import { z } from "zod";
import type { FetchResult } from "../cache.js";
import { ProviderError } from "../errors.js";

export interface PriceQuote {
  /** Prix de 1 Pi en USD (chaîne décimale). */
  priceUsd: string;
}

export interface CoinGeckoOptions {
  fetchFn?: typeof fetch;
  baseUrl: string;
  apiKey?: string | undefined;
  keyHeader: string;
  coinId: string;
  timeoutMs?: number;
}

const entrySchema = z.object({
  usd: z.number().finite().positive().lt(10_000_000),
  last_updated_at: z.number().int().positive().optional(),
});
const bodySchema = z.record(z.unknown());

/**
 * Prix du Pi en USD depuis CoinGecko (/simple/price).
 * La réponse est traitée comme non fiable : forme et valeurs sont validées.
 * L'actif « Pi Network [IOU] » (autre fiche) est refusé explicitement.
 */
export async function fetchPiPriceUsd(o: CoinGeckoOptions): Promise<FetchResult<PriceQuote>> {
  if (/iou/i.test(o.coinId)) {
    throw new ProviderError("Actif non autorisé : la fiche IOU n'est pas le Pi.");
  }
  const fetchFn = o.fetchFn ?? fetch;
  const url = new URL(`${o.baseUrl.replace(/\/+$/, "")}/simple/price`);
  url.searchParams.set("ids", o.coinId);
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_last_updated_at", "true");

  const headers: Record<string, string> = { accept: "application/json" };
  if (o.apiKey) headers[o.keyHeader] = o.apiKey;

  let res: Response;
  try {
    res = await fetchFn(url, { headers, signal: AbortSignal.timeout(o.timeoutMs ?? 8000) });
  } catch {
    throw new ProviderError("CoinGecko injoignable ou délai dépassé");
  }
  if (res.status === 429) throw new ProviderError("CoinGecko : limite d'appels atteinte (429)");
  if (!res.ok) throw new ProviderError(`CoinGecko : réponse HTTP ${res.status}`);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ProviderError("CoinGecko : réponse non JSON");
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) throw new ProviderError("CoinGecko : format inattendu");
  const raw = body.data[o.coinId];
  if (raw === undefined) throw new ProviderError("CoinGecko : actif introuvable ou sans cotation");
  const entry = entrySchema.safeParse(raw);
  if (!entry.success) throw new ProviderError("CoinGecko : cotation invalide");

  return {
    value: { priceUsd: String(entry.data.usd) },
    sourceTime: entry.data.last_updated_at ? entry.data.last_updated_at * 1000 : null,
  };
}
