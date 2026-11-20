export type ErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_CURRENCY"
  | "CURRENCY_UNAVAILABLE"
  | "PRICE_UNAVAILABLE"
  | "RATES_UNAVAILABLE"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "UPSTREAM_ERROR"
  | "NOT_FOUND"
  | "INTERNAL";

/** Erreur destinée au client : le message est en français et sans donnée sensible. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Erreur d'un fournisseur externe (réponse invalide, HTTP non 2xx, délai dépassé…). */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}
