import { useMemo, useState } from "react";
import { IconChevron, IconCopy, IconRefresh, IconSwap, IconWarning } from "../components/Icons";
import { InfoPanel } from "../components/InfoPanel";
import { useConversion } from "../hooks/useConversion";
import { useNow } from "../hooks/useMisc";
import type { ApiError } from "../lib/api";
import { AMOUNT_MESSAGES, displayResult, formatDecimal, formatWhen, normalizeAmountInput, resultUnit } from "../lib/format";
import type { ConvertParams, ConvertResponse, Currency, Direction } from "../types";

interface Props {
  /** false tant que la valeur du Pi n'est pas disponible : aucun calcul, aucune requête de prix. */
  piValueAvailable: boolean;
  amount: string;
  onAmount: (v: string) => void;
  direction: Direction;
  onSwap: () => void;
  currency: string;
  currencies: Currency[];
  onPickCurrency: () => void;
  online: boolean;
}

interface BannerSpec {
  title: string;
  text: string;
  retry?: boolean;
  pick?: boolean;
}

function bannerFor(error: ApiError): BannerSpec {
  switch (error.code) {
    case "PRICE_UNAVAILABLE":
      return {
        title: "Prix du Pi indisponible",
        text: "La source de prix ne répond pas pour le moment. Aucun résultat n'est affiché afin de ne pas présenter un prix inventé ou périmé comme un prix de marché actuel.",
        retry: true,
      };
    case "RATES_UNAVAILABLE":
      return {
        title: "Taux de change indisponibles",
        text: "La source des taux ne répond pas pour le moment. Aucun résultat n'est affiché.",
        retry: true,
      };
    case "CURRENCY_UNAVAILABLE":
    case "UNSUPPORTED_CURRENCY":
      return { title: "Devise indisponible", text: error.message, pick: true };
    case "NETWORK":
    case "TIMEOUT":
      return { title: "Connexion impossible", text: error.message, retry: true };
    case "RATE_LIMITED":
      return { title: "Trop de requêtes", text: error.message, retry: true };
    default:
      return { title: "Une erreur est survenue", text: error.message, retry: true };
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function copyLabel(d: ConvertResponse): string {
  const from = d.direction === "pi_to_fiat" ? "Pi" : d.currency.code;
  const origin = `estimation de marché, source ${d.sources.price?.name ?? "—"}`;
  const stale = d.dataState === "stale" ? ", données périmées" : "";
  return `${formatDecimal(d.amount)} ${from} ≈ ${displayResult(d)} ${resultUnit(d)} — ValueConvert (${origin}${stale})`;
}

export function ConverterPage(p: Props) {
  const now = useNow();
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const amount = useMemo(() => normalizeAmountInput(p.amount), [p.amount]);

  const params: ConvertParams | null =
    amount.value && p.piValueAvailable ? { direction: p.direction, amount: amount.value, currency: p.currency } : null;

  const { state, refresh } = useConversion(params);
  const data = state.status === "ok" || state.status === "loading" ? (state.data ?? null) : null;
  const loading = state.status === "loading";
  const error = state.status === "error" ? state.error : null;
  const currencyInfo = p.currencies.find((c) => c.code === p.currency);
  const piFirst = p.direction === "pi_to_fiat";

  const banner: BannerSpec | null = !p.online
    ? {
        title: "Vous êtes hors ligne",
        text: "Reconnectez-vous pour obtenir des prix à jour. Aucun résultat n'est affiché sans données.",
      }
    : error
      ? bannerFor(error)
      : null;

  async function onCopy() {
    if (!data || state.status !== "ok") return;
    const ok = await copyText(copyLabel(data));
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied("idle"), 2200);
  }

  const chipCurrency = (
    <button type="button" className="chip" onClick={p.onPickCurrency} aria-label={`Changer la devise (actuelle : ${p.currency})`}>
      {p.currency}
      <IconChevron />
    </button>
  );
  const chipPi = (
    <span className="chip fixed" aria-label="Pi">
      Pi
    </span>
  );

  const resultText = !p.piValueAvailable ? "À venir" : data && !error && p.online ? displayResult(data) : "—";
  const showResult = resultText !== "—" && p.piValueAvailable;

  return (
    <>
      {!p.piValueAvailable && (
        <section className="notice soon-notice" role="status">
          <strong>La valeur du Pi est à venir</strong>
          <span>Elle n'est pas encore disponible. Dès qu'elle le sera, la conversion s'affichera ici.</span>
        </section>
      )}

      {banner && (
        <section className="notice error-notice" role="alert">
          <div className="row gap-s">
            <IconWarning />
            <strong>{banner.title}</strong>
          </div>
          <span>{banner.text}</span>
          <div className="row gap-s wrap">
            {banner.retry && p.online && (
              <button type="button" className="btn small" onClick={refresh}>
                Réessayer
              </button>
            )}
            {banner.pick && (
              <button type="button" className="btn small" onClick={p.onPickCurrency}>
                Choisir une autre devise
              </button>
            )}
          </div>
        </section>
      )}

      {!banner && data && data.dataState === "stale" && state.status === "ok" && (
        <section className="notice warn-notice" role="status">
          <div className="row gap-s">
            <IconWarning />
            <strong>Données périmées</strong>
          </div>
          <span>
            Ces valeurs ne sont plus actuelles
            {data.sources.price?.state === "stale" &&
              ` (prix : ${formatWhen(data.sources.price.sourceUpdatedAt ?? data.sources.price.fetchedAt, now)})`}
            {data.sources.fx?.state === "stale" &&
              ` (taux : ${formatWhen(data.sources.fx.sourceUpdatedAt ?? data.sources.fx.fetchedAt, now)})`}
            . Ne les utilisez pas comme un prix de marché actuel.
          </span>
        </section>
      )}

      <section className="card converter" aria-label="Convertisseur">
        <div className="field">
          <label className="label" htmlFor="amount">
            Vous avez
          </label>
          <div className="row gap-s">
            <input
              id="amount"
              className="big-input"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={p.amount}
              onChange={(e) => p.onAmount(e.target.value)}
              aria-invalid={amount.error !== undefined && amount.error !== "EMPTY"}
              aria-describedby="amount-hint"
            />
            {piFirst ? chipPi : chipCurrency}
          </div>
          <p id="amount-hint" className="hint error" role={amount.error && amount.error !== "EMPTY" ? "alert" : undefined}>
            {amount.error ? AMOUNT_MESSAGES[amount.error] : ""}
          </p>
        </div>

        <div className="swap-row">
          <span className="line" />
          <button type="button" className="swap" onClick={p.onSwap} aria-label="Inverser les devises">
            <IconSwap />
          </button>
          <span className="line" />
        </div>

        <div className="field">
          <span className="label" id="res-label">
            {p.piValueAvailable ? "Vous obtenez (estimation)" : "Valeur du Pi"}
            {data?.dataState === "stale" && showResult ? " — données périmées" : ""}
          </span>
          <div className="row gap-s">
            <output
              className={`big-result ${loading && !showResult ? "skeleton" : ""} ${loading && showResult ? "dim" : ""} ${showResult ? "" : "empty"} ${p.piValueAvailable ? "" : "soon"}`}
              aria-labelledby="res-label"
              aria-live="polite"
              aria-busy={loading}
            >
              {p.piValueAvailable && loading && !showResult ? "…" : resultText}
            </output>
            {piFirst ? chipCurrency : chipPi}
          </div>
          <p className="hint">{currencyInfo ? currencyInfo.name : " "}</p>
        </div>
      </section>

      {p.piValueAvailable && data && !error && p.online && <InfoPanel data={data} now={now} />}

      <div className="actions">
        <button type="button" className="btn grow" onClick={onCopy} disabled={state.status !== "ok"}>
          <IconCopy />
          {copied === "ok" ? "Copié !" : copied === "fail" ? "Copie impossible" : "Copier le résultat"}
        </button>
        <button type="button" className="btn ghost" onClick={() => p.onAmount("")}>
          Effacer
        </button>
        <button type="button" className="btn ghost icon" onClick={refresh} aria-label="Actualiser les prix" disabled={!params || !p.piValueAvailable}>
          <IconRefresh />
        </button>
      </div>


      <p className="legal">
        {p.piValueAvailable
          ? (data?.disclaimer ??
            "Estimation indicative basée sur des cotations externes ; ce n'est ni un prix garanti ni une conversion exécutable.")
          : "La valeur du Pi n'est pas encore disponible. Aucune estimation n'est affichée."}
      </p>
    </>
  );
}
