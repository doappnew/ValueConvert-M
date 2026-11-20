/**
 * Intégration minimale du SDK officiel Pi (https://sdk.minepi.com/pi-sdk.js).
 * - Pi.init({ version: "2.0" }) : version prescrite par la documentation.
 * - Le réseau est choisi dans le Pi Developer Portal, pas dans le code.
 * - Aucune connexion n'est imposée : le calculateur fonctionne sans le SDK.
 * - Aucun paiement dans cette version.
 */
interface PiAuthResult {
  accessToken: string;
  user: { uid: string; username?: string };
}

interface PiSdk {
  init(options: { version: string; sandbox?: boolean }): void;
  authenticate(scopes: string[], onIncompletePaymentFound: (payment: unknown) => void): Promise<PiAuthResult>;
}

declare global {
  interface Window {
    Pi?: PiSdk;
  }
}

let initialized = false;
let sandbox = false;

/** À appeler avant la première connexion : le mode bac à sable vient de la configuration du serveur. */
export function setPiSandbox(value: boolean): void {
  sandbox = value;
}

/** Informations non secrètes pour diagnostiquer une connexion qui échoue. */
export function piDiagnostics(): string {
  const sdk = typeof window !== "undefined" && window.Pi ? "oui" : "non";
  const ua = navigator.userAgent;
  return `origine ${window.location.origin} · SDK ${sdk} · sandbox ${sandbox ? "oui" : "non"} · Pi Browser ${/PiBrowser/i.test(ua) ? "oui" : "non"} · UA ${ua.slice(0, 90)}`;
}

export function getPi(): PiSdk | null {
  if (typeof window === "undefined" || !window.Pi) return null;
  if (!initialized) {
    try {
      window.Pi.init(sandbox ? { version: "2.0", sandbox: true } : { version: "2.0" });
      initialized = true;
    } catch {
      return null;
    }
  }
  return window.Pi;
}

export function isPiBrowser(): boolean {
  // Ne déclenche pas Pi.init : la configuration (sandbox) n'est pas encore connue à l'affichage.
  // Le script du SDK définit window.Pi dans N'IMPORTE QUEL navigateur : sa présence ne prouve pas Pi Browser.
  return typeof navigator !== "undefined" && /PiBrowser/i.test(navigator.userAgent);
}

/**
 * Demande l'authentification Pi avec la seule permission « username » et renvoie le jeton d'accès,
 * à transmettre UNIQUEMENT au serveur (qui le vérifie auprès de la Platform API).
 */
export async function piAuthenticate(): Promise<string> {
  const pi = getPi();
  if (!pi) throw new Error("PI_UNAVAILABLE");
  // Pas de paiements dans cette version : rien à reprendre si un paiement incomplet est signalé.
  const auth = await pi.authenticate(["username"], () => undefined);
  return auth.accessToken;
}

/* ------------------------------------------------------------------ *
 * Pass payant : l'autorisation « payments » n'est demandée qu'au clic, jamais à la connexion.
 * ------------------------------------------------------------------ */

interface PiPaymentCallbacks {
  onReadyForServerApproval(paymentId: string): void;
  onReadyForServerCompletion(paymentId: string, txid: string): void;
  onCancel(paymentId: string): void;
  onError(error: Error, payment?: unknown): void;
}

interface PiPaymentSdk {
  authenticate(scopes: string[], onIncompletePaymentFound: (payment: unknown) => void): Promise<PiAuthResult>;
  createPayment(data: { amount: number; memo: string; metadata: object }, callbacks: PiPaymentCallbacks): void;
}

export type IncompletePayment = { identifier?: string; transaction?: { txid?: string } | null };

export async function piAuthenticateWith(scopes: string[], onIncomplete: (p: IncompletePayment) => void): Promise<string> {
  const pi = getPi() as unknown as PiPaymentSdk | null;
  if (!pi) throw new Error("PI_UNAVAILABLE");
  const auth = await pi.authenticate(scopes, (p) => onIncomplete((p ?? {}) as IncompletePayment));
  return auth.accessToken;
}

/** Lance un paiement utilisateur → application ; les montants et vérifications restent côté serveur. */
export function piCreatePayment(
  data: { amount: number; memo: string; metadata: object },
  cb: { approve(id: string): Promise<void>; complete(id: string, txid: string): Promise<void>; cancel(): void; error(e: Error): void },
): void {
  const pi = getPi() as unknown as PiPaymentSdk | null;
  if (!pi) throw new Error("PI_UNAVAILABLE");
  pi.createPayment(data, {
    onReadyForServerApproval: (id) => void cb.approve(id).catch((e: unknown) => cb.error(e instanceof Error ? e : new Error("approve"))),
    onReadyForServerCompletion: (id, txid) => void cb.complete(id, txid).catch((e: unknown) => cb.error(e instanceof Error ? e : new Error("complete"))),
    onCancel: () => cb.cancel(),
    onError: (e) => cb.error(e),
  });
}
