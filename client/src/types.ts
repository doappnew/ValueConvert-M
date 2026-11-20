export type Direction = "pi_to_fiat" | "fiat_to_pi";
export type Route = "marche" | "devises" | "reglages";

export interface Currency {
  code: string;
  name: string;
  decimals: number;
}

export interface SourceInfo {
  name: string;
  state: "live" | "stale" | "unavailable";
  staleReason?: string;
  sourceUpdatedAt: string | null;
  fetchedAt: string | null;
  attribution: { text: string; url: string };
}

export interface ConvertResponse {
  direction: Direction;
  amount: string;
  currency: Currency;
  result: string;
  resultPrecise: string;
  priceUsd: string;
  usdToFiat: string;
  unitPriceFiat: string;
  sources: { price: SourceInfo | null; fx: SourceInfo | null };
  dataState: "live" | "stale";
  disclaimer: string;
}

export interface StatusResponse {
  env: string;
  /** null tant que la valeur du Pi n'est pas disponible. */
  price: SourceInfo | null;
  fx: SourceInfo;
}

export interface AppConfig {
  appName: string;
  env: "mainnet";
  piValueAvailable: boolean;
  piSandbox: boolean;
}

export interface ConvertParams {
  direction: Direction;
  amount: string;
  currency: string;
}
