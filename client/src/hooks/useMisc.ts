import { useCallback, useEffect, useState } from "react";
import type { Route } from "../types";
import { readPref, writePref } from "../lib/storage";

const ROUTES: Route[] = ["marche", "devises", "reglages"];

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  return (ROUTES as string[]).includes(h) ? (h as Route) : "marche";
}

/** Routage par « hash » : fonctionne sur tout hébergement statique et dans Pi Browser. */
export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((r: Route) => {
    if (window.location.hash !== `#/${r}`) window.location.hash = `#/${r}`;
  }, []);
  return [route, navigate];
}

/** Valeur conservée dans localStorage, validée à la lecture. */
export function usePersisted<T extends string>(
  key: string,
  initial: T,
  isValid: (v: string) => v is T,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = readPref(key);
    return stored !== null && isValid(stored) ? stored : initial;
  });
  const update = useCallback(
    (v: T) => {
      setValue(v);
      writePref(key, v);
    },
    [key],
  );
  return [value, update];
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Horloge qui force le recalcul des « il y a X min » toutes les 30 s. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
