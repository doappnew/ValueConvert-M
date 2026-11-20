import type { ConvertResponse } from "../types";

const NNBSP = " "; // espace fine insécable, comme fr-FR

function groupInt(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
}

/**
 * Formate une chaîne décimale sans passer par Number (aucune perte de précision, même pour 3×10^17).
 * Séparateur décimal : virgule ; milliers : espace fine insécable.
 */
export function formatDecimal(value: string, opts: { minFraction?: number; trimZeros?: boolean } = {}): string {
  const neg = value.startsWith("-");
  const v = neg ? value.slice(1) : value;
  const [intRaw = "0", fracRaw = ""] = v.split(".");
  const int = intRaw === "" ? "0" : intRaw;
  let frac = opts.trimZeros === false ? fracRaw : fracRaw.replace(/0+$/, "");
  const min = opts.minFraction ?? 0;
  if (frac.length < min) frac = frac.padEnd(min, "0");
  return `${neg ? "-" : ""}${groupInt(int)}${frac ? `,${frac}` : ""}`;
}

export type AmountError = "EMPTY" | "INVALID" | "ZERO" | "TOO_LARGE" | "TOO_PRECISE";

export interface AmountResult {
  value: string | null;
  error?: AmountError;
}

const MAX_INT_DIGITS = 13;
const MAX_FRACTION_DIGITS = 12;

/**
 * Transforme la saisie (« 1 000,5 ») en montant canonique (« 1000.5 ») attendu par l'API.
 * Le serveur revalide tout : ceci ne sert qu'à guider l'utilisateur.
 */
export function normalizeAmountInput(raw: string): AmountResult {
  const cleaned = raw.replace(/[\s  ]/g, "").replace(",", ".");
  if (cleaned === "") return { value: null, error: "EMPTY" };
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === ".") return { value: null, error: "INVALID" };
  let [int = "", frac = ""] = cleaned.split(".");
  int = int.replace(/^0+(?=\d)/, "");
  if (int === "") int = "0";
  if (int.length > MAX_INT_DIGITS) return { value: null, error: "TOO_LARGE" };
  if (frac.length > MAX_FRACTION_DIGITS) return { value: null, error: "TOO_PRECISE" };
  if (/^0*$/.test(int) && /^0*$/.test(frac)) return { value: null, error: "ZERO" };
  if (int.length === MAX_INT_DIGITS && Number(int) > 1_000_000_000_000) return { value: null, error: "TOO_LARGE" };
  if (int.length === MAX_INT_DIGITS && Number(int) === 1_000_000_000_000 && /[1-9]/.test(frac)) {
    return { value: null, error: "TOO_LARGE" };
  }
  return { value: frac ? `${int}.${frac}` : int };
}

export const AMOUNT_MESSAGES: Record<AmountError, string> = {
  EMPTY: "",
  INVALID: "Saisissez un nombre positif (ex. 100 ou 12,5).",
  ZERO: "Le montant doit être supérieur à 0.",
  TOO_LARGE: "Montant trop grand (maximum 1 000 000 000 000).",
  TOO_PRECISE: "Trop de décimales (maximum 12).",
};

/** Texte du résultat : arrondi de la monnaie, ou valeur précise si l'arrondi donne 0. */
export function displayResult(r: ConvertResponse): string {
  const rounded = formatDecimal(r.result, {
    minFraction: r.direction === "pi_to_fiat" ? r.currency.decimals : 2,
  });
  const isZero = /^0*\.?0*$/.test(r.result);
  const preciseZero = /^0*\.?0*$/.test(r.resultPrecise);
  if (isZero && !preciseZero) return `≈ ${formatDecimal(r.resultPrecise)}`;
  return rounded;
}

export function resultUnit(r: ConvertResponse): string {
  return r.direction === "pi_to_fiat" ? r.currency.code : "Pi";
}

export function formatClock(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** « il y a 3 min (14:32) » ; la date complète au-delà de 24 h. */
export function formatWhen(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "heure inconnue";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "heure inconnue";
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 1) return `à l'instant (${formatClock(iso)})`;
  if (min < 60) return `il y a ${min} min (${formatClock(iso)})`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h (${formatClock(iso)})`;
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}
