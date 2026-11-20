import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../lib/api";
import type { ConvertParams, ConvertResponse } from "../types";

export type ConversionState =
  | { status: "idle" }
  | { status: "loading"; data?: ConvertResponse }
  | { status: "ok"; data: ConvertResponse }
  | { status: "error"; error: ApiError };

const DEBOUNCE_MS = 300;
const REFRESH_MS = 60_000;

/**
 * Appelle l'API de conversion (le serveur calcule avec ses propres prix et taux : le navigateur
 * n'envoie jamais de prix). Actualisation automatique toutes les 60 s et au retour sur l'onglet.
 * En cas d'erreur, l'ancien résultat n'est PAS conservé : aucun chiffre périmé présenté comme actuel.
 */
export function useConversion(params: ConvertParams | null) {
  const key = params ? JSON.stringify(params) : null;
  const [state, setState] = useState<ConversionState>({ status: "idle" });
  const reqId = useRef(0);
  const ctrlRef = useRef<AbortController | null>(null);
  const lastOk = useRef<{ key: string; data: ConvertResponse } | null>(null);
  const current = useRef<{ params: ConvertParams; key: string } | null>(null);
  current.current = params && key ? { params, key } : null;

  const run = useCallback(async (p: ConvertParams, k: string) => {
    const id = ++reqId.current;
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const data = await api.convert(p, ctrl.signal);
      if (id !== reqId.current) return;
      lastOk.current = { key: k, data };
      setState({ status: "ok", data });
    } catch (e) {
      if (id !== reqId.current || ctrl.signal.aborted) return;
      lastOk.current = null;
      setState({
        status: "error",
        error: e instanceof ApiError ? e : new ApiError("INTERNAL", "Erreur inattendue."),
      });
    }
  }, []);

  // Changement de paramètres : attente courte (saisie en cours) puis appel.
  useEffect(() => {
    if (!params || !key) {
      reqId.current++;
      ctrlRef.current?.abort();
      lastOk.current = null;
      setState({ status: "idle" });
      return;
    }
    const same = lastOk.current?.key === key ? lastOk.current.data : undefined;
    setState(same ? { status: "loading", data: same } : { status: "loading" });
    const t = setTimeout(() => void run(params, key), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, run]);

  const refresh = useCallback(() => {
    const c = current.current;
    if (!c) return;
    setState((s) => (s.status === "ok" ? { status: "loading", data: s.data } : { status: "loading" }));
    void run(c.params, c.key);
  }, [run]);

  // Actualisation périodique et au retour au premier plan.
  useEffect(() => {
    const tick = () => {
      const c = current.current;
      if (c && document.visibilityState === "visible") void run(c.params, c.key);
    };
    const id = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [run]);

  useEffect(
    () => () => {
      reqId.current++;
      ctrlRef.current?.abort();
    },
    [],
  );

  return { state, refresh };
}
