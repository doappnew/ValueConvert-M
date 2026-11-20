import type { SourceInfo, StatusResponse } from "../types";

export type Health = "loading" | "live" | "stale" | "down" | "offline" | "soon";

/** Résume l'état des sources. Tant que la valeur du Pi n'est pas disponible, on l'indique simplement. */
export function healthOf(
  piValueAvailable: boolean,
  status: StatusResponse | null,
  loading: boolean,
  online: boolean,
): Health {
  if (!online) return "offline";
  if (!piValueAvailable) return "soon";
  if (loading && !status) return "loading";
  if (!status) return "down";
  const sources: SourceInfo[] = [status.price, status.fx].filter((s): s is SourceInfo => s !== null);
  if (sources.some((s) => s.state === "unavailable")) return "down";
  if (sources.some((s) => s.state === "stale")) return "stale";
  return "live";
}

const LABELS: Record<Health, string> = {
  loading: "Connexion…",
  live: "Données à jour",
  stale: "Données périmées",
  down: "Données indisponibles",
  offline: "Hors ligne",
  soon: "Valeur du Pi : à venir",
};

export function StatusPill({ health }: { health: Health }) {
  return (
    <span className={`status-pill ${health}`} role="status">
      <i aria-hidden="true" />
      {LABELS[health]}
    </span>
  );
}

export function StateChip({ state }: { state: SourceInfo["state"] }) {
  const text = state === "live" ? "À jour" : state === "stale" ? "Périmé" : "Indisponible";
  return <span className={`chip-state ${state}`}>{text}</span>;
}
