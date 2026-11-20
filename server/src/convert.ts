import { Decimal } from "decimal.js";
import { AppError } from "./errors.js";
import { PI_DECIMALS, type Currency } from "./currencies.js";

// Précision élevée et arrondi « half up » : aucune erreur d'arrondi binaire (pas de Number).
const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

export const MAX_AMOUNT = new D("1000000000000"); // 1 000 milliards
export const MIN_REFERENCE = new D("0.000001");
export const MAX_REFERENCE = new D("1000000000000");

const AMOUNT_RE = /^\d{1,13}(\.\d{1,12})?$/;

/** Montant fini, strictement positif et dans des limites raisonnables. */
export function parseAmount(raw: string): Decimal {
  if (!AMOUNT_RE.test(raw)) {
    throw new AppError("INVALID_INPUT", "Montant invalide : saisissez un nombre positif (ex. 100 ou 12.5).", 400);
  }
  const d = new D(raw);
  if (!d.isFinite() || d.lte(0)) {
    throw new AppError("INVALID_INPUT", "Le montant doit être supérieur à 0.", 400);
  }
  if (d.gt(MAX_AMOUNT)) {
    throw new AppError("INVALID_INPUT", "Montant trop grand (maximum 1 000 000 000 000).", 400);
  }
  return d;
}

export function toDecimal(value: string): Decimal {
  const d = new D(value);
  if (!d.isFinite() || d.lte(0)) throw new Error("Valeur numérique invalide");
  return d;
}

/** Pi → fiat : montant Pi × prix USD du Pi × taux USD→devise. */
export function piToFiat(amountPi: Decimal, priceUsd: Decimal, usdToFiat: Decimal): Decimal {
  return amountPi.times(priceUsd).times(usdToFiat);
}

/** Fiat → Pi : montant fiat ÷ taux USD→devise ÷ prix USD du Pi. */
export function fiatToPi(amountFiat: Decimal, priceUsd: Decimal, usdToFiat: Decimal): Decimal {
  return amountFiat.div(usdToFiat).div(priceUsd);
}

export interface Rounded {
  /** Résultat arrondi aux décimales de la monnaie d'arrivée. */
  result: string;
  /** Résultat avec 10 décimales, utile quand l'arrondi donne 0. */
  resultPrecise: string;
}

export function roundForCurrency(value: Decimal, currency: Currency): Rounded {
  return {
    result: value.toDecimalPlaces(currency.decimals, Decimal.ROUND_HALF_UP).toFixed(currency.decimals),
    resultPrecise: value.toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toFixed(10),
  };
}

export function roundForPi(value: Decimal): Rounded {
  return {
    result: value.toDecimalPlaces(PI_DECIMALS, Decimal.ROUND_HALF_UP).toFixed(PI_DECIMALS),
    resultPrecise: value.toDecimalPlaces(10, Decimal.ROUND_HALF_UP).toFixed(10),
  };
}

export { D as DecimalCtor };
