import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import type { AppConfig, Currency, StatusResponse } from "../types";

export function useConfig(): AppConfig | null {
  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .config(ctrl.signal)
      .then(setConfig)
      .catch(() => undefined); // sans configuration : simplement pas de badge d'environnement
    return () => ctrl.abort();
  }, []);
  return config;
}

export function useCurrencies() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .currencies(ctrl.signal)
      .then((r) => {
        setCurrencies(r.currencies);
        setError(null);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof ApiError ? e : new ApiError("INTERNAL", "Erreur inattendue."));
      });
    return () => ctrl.abort();
  }, [attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { currencies, error, retry };
}

/** État des sources de données, interrogé toutes les 60 s. */
export function useStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const load = () => {
      api
        .status(ctrl.signal)
        .then((s) => {
          setStatus(s);
          setError(null);
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          setStatus(null);
          setError(e instanceof ApiError ? e : new ApiError("INTERNAL", "Erreur inattendue."));
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    };
    setLoading(true);
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => {
      clearInterval(id);
      ctrl.abort();
    };
  }, [attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  return { status, error, loading, refresh };
}
