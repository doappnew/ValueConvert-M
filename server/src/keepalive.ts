/**
 * Service d'éveil : auto-appel de /api/health toutes les 5 minutes, uniquement pendant une plage de 8 heures
 * (par défaut 9 h – 17 h, heure de Los Angeles, tous les jours), pour ne pas consommer les 750 heures gratuites
 * de Render en continu. Le fuseau suit lui-même le changement d'heure américain.
 * Aucune donnée envoyée, erreurs ignorées. Hors plage, le service peut se mettre en veille.
 */
export interface KeepAliveOptions {
  /** Fuseau de référence de la plage (nom IANA). */
  timeZone?: string;
  /** Heure de début (incluse), 0–23. */
  startHour?: number;
  /** Heure de fin (exclue), 1–24. */
  endHour?: number;
  intervalMs?: number;
  now?: () => Date;
}

export function hourIn(timeZone: string, date: Date): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(date);
  return Number.parseInt(h, 10) % 24;
}

export function inWindow(date: Date, timeZone: string, startHour: number, endHour: number): boolean {
  const h = hourIn(timeZone, date);
  return startHour <= endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour;
}

export function startKeepAlive(
  rawUrl: string | undefined,
  fetchFn: typeof fetch = fetch,
  opts: KeepAliveOptions = {},
): ReturnType<typeof setInterval> | null {
  const selfUrl = (rawUrl || "").replace(/\/$/, "");
  if (!selfUrl) return null;
  const timeZone = opts.timeZone ?? "America/Los_Angeles";
  const startHour = opts.startHour ?? 9;
  const endHour = opts.endHour ?? 17;
  const now = opts.now ?? (() => new Date());
  console.log(`Service d'éveil actif : de ${startHour} h à ${endHour} h (${timeZone}).`);
  return setInterval(() => {
    if (!inWindow(now(), timeZone, startHour, endHour)) return;
    fetchFn(selfUrl + "/api/health", { signal: AbortSignal.timeout(10000) }).catch(() => {});
  }, opts.intervalMs ?? 5 * 60 * 1000);
}
