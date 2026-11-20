/**
 * Auto-ping toutes les 5 minutes pour que l'offre gratuite de Render ne mette pas le service en veille.
 * Aucune donnée envoyée, rien de journalisé, les erreurs sont ignorées.
 */
export function startKeepAlive(rawUrl: string | undefined, fetchFn: typeof fetch = fetch): ReturnType<typeof setInterval> | null {
  const selfUrl = (rawUrl || "").replace(/\/$/, "");
  if (!selfUrl) return null;
  return setInterval(() => {
    fetchFn(selfUrl + "/api/health", { signal: AbortSignal.timeout(10000) }).catch(() => {});
  }, 5 * 60 * 1000);
}
