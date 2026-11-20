import { useCallback, useState } from "react";
import { ApiError, api } from "../lib/api";
import { isPiBrowser, piAuthenticate, piDiagnostics, setPiSandbox } from "../lib/pi";

const KEY = "vc:user";
const GUEST_KEY = "vc:guest";

function readGuest(): boolean {
  try {
    return window.sessionStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}

function readUser(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Message utile pour l'utilisateur ET assez précis pour qu'une capture d'écran permette de diagnostiquer. */
export function explainLoginError(e: unknown): string {
  if (e instanceof ApiError) return `${e.message} (code ${e.code}${e.status ? `, ${e.status}` : ""})`;
  if (e instanceof Error && e.message === "PI_UNAVAILABLE") {
    return "Le SDK Pi n'est pas disponible. Ouvrez ValueConvert dans Pi Browser.";
  }
  const name = e instanceof Error && e.name !== "Error" ? `${e.name} : ` : "";
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e ?? "");
  const detail = `${name}${(msg ?? "").slice(0, 160)}`.trim();
  const hint = isPiBrowser() ? "" : " Cette page ne semble pas ouverte dans Pi Browser : ouvrez ValueConvert depuis Pi Browser.";
  return `La connexion Pi a échoué${detail ? ` — ${detail}` : ""}.${hint} [${piDiagnostics()}]`;
}

/**
 * Connexion Pi : le navigateur ne transmet que le jeton d'accès, que le serveur vérifie auprès de la Platform API.
 * Seul le nom d'utilisateur (non secret) est gardé pour la durée de la session de l'onglet.
 */
export function useAuth() {
  const [user, setUser] = useState<string | null>(readUser);
  const [guest, setGuest] = useState<boolean>(readGuest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const cfg = await api.config().catch(() => null);
      // Bac à sable Pi : réglage serveur, ou détecté (adresse ?sandbox=1, ou ouverture depuis sandbox.minepi.com).
      const fromUrl =
        new URLSearchParams(window.location.search).get("sandbox") === "1" || /(^|\.)sandbox\.minepi\.com/.test(document.referrer);
      setPiSandbox(cfg?.piSandbox === true || fromUrl);
      const token = await piAuthenticate();
      const r = await api.piVerify(token);
      const name = r.username ?? "Pionnier";
      try {
        window.sessionStorage.setItem(KEY, name);
      } catch {
        /* stockage indisponible : la session ne survivra pas au rechargement */
      }
      setUser(name);
      setGuest(false);
    } catch (e) {
      setError(explainLoginError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  /** Entrée sans connexion : la connexion Pi n'est demandée que si l'on veut faire les tests de paiement. */
  const continueAsGuest = useCallback(() => {
    try {
      window.sessionStorage.setItem(GUEST_KEY, "1");
    } catch {
      /* ignore */
    }
    setError(null);
    setGuest(true);
  }, []);

  const logout = useCallback(() => {
    try {
      window.sessionStorage.removeItem(KEY);
      window.sessionStorage.removeItem(GUEST_KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
    setGuest(false);
  }, []);

  return { user, guest, busy, error, login, logout, continueAsGuest };
}
