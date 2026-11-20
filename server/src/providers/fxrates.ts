import { z } from "zod";
import type { FetchResult } from "../cache.js";
import { ProviderError } from "../errors.js";

export interface FxTable {
  /** Taux « 1 USD = x devise », en chaînes décimales (positifs). */
  rates: Record<string, string>;
}

export interface FxOptions {
  fetchFn?: typeof fetch;
  url: string;
  timeoutMs?: number;
}

const bodySchema = z.object({
  result: z.literal("success"),
  time_last_update_unix: z.number().int().positive(),
  rates: z.record(z.unknown()),
});

/**
 * Taux de change USD → devises depuis ExchangeRate-API (endpoint ouvert, mise à jour quotidienne).
 * Les taux non numériques, nuls ou négatifs sont ignorés ; la devise est alors « indisponible ».
 */
export async function fetchUsdRates(o: FxOptions): Promise<FetchResult<FxTable>> {
  const fetchFn = o.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(o.url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(o.timeoutMs ?? 8000),
    });
  } catch {
    throw new ProviderError("Source de taux injoignable ou délai dépassé");
  }
  if (res.status === 429) throw new ProviderError("Source de taux : limite d'appels atteinte (429)");
  if (!res.ok) throw new ProviderError(`Source de taux : réponse HTTP ${res.status}`);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ProviderError("Source de taux : réponse non JSON");
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) throw new ProviderError("Source de taux : format inattendu");

  const rates: Record<string, string> = {};
  for (const [code, value] of Object.entries(body.data.rates)) {
    if (/^[A-Z]{3}$/.test(code) && typeof value === "number" && Number.isFinite(value) && value > 0) {
      rates[code] = String(value);
    }
  }
  if (Object.keys(rates).length === 0) throw new ProviderError("Source de taux : aucun taux valide");

  return { value: { rates }, sourceTime: body.data.time_last_update_unix * 1000 };
}
