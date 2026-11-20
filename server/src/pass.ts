import express, { type Router } from "express";
import { z } from "zod";
import type { Config } from "./config.js";
import { AppError } from "./errors.js";

/**
 * Pass payant : l'utilisateur paie un montant FIXE en Pi (fixé par le serveur) pour un accès de N jours.
 * Flux U2A : approve → complete. Le serveur vérifie le propriétaire, le sens, le réseau, l'objet et le montant
 * avant d'approuver puis de terminer, et n'accorde le pass qu'une seule fois par paiement (idempotent).
 */

export type PaymentDTO = {
  identifier: string;
  user_uid: string;
  amount: number;
  metadata?: { purpose?: string } & Record<string, unknown>;
  direction: "user_to_app" | "app_to_user";
  network?: string;
  status: { developer_approved: boolean; transaction_verified: boolean; developer_completed: boolean; cancelled: boolean; user_cancelled: boolean };
  transaction: { txid: string; verified: boolean } | null;
};

/** Stockage des paiements et des pass (Supabase en production, mémoire dans les tests). */
export interface PassStore {
  getExpiry(uid: string): Promise<Date | null>;
  /** Enregistre un paiement approuvé (sans effet s'il existe déjà). */
  recordApproved(paymentId: string, uid: string, amount: number): Promise<void>;
  /** Marque le paiement comme terminé. Retourne true UNIQUEMENT la première fois (pour n'accorder le pass qu'une fois). */
  markCompleted(paymentId: string, uid: string, txid: string): Promise<boolean>;
  /** Prolonge le pass : à partir de maintenant, ou de l'échéance actuelle si le pass est encore actif. */
  extend(uid: string, days: number): Promise<Date>;
}

export class MemoryPassStore implements PassStore {
  payments = new Map<string, { uid: string; status: string }>();
  passes = new Map<string, Date>();
  async getExpiry(uid: string) {
    return this.passes.get(uid) ?? null;
  }
  async recordApproved(paymentId: string, uid: string) {
    if (!this.payments.has(paymentId)) this.payments.set(paymentId, { uid, status: "approved" });
  }
  async markCompleted(paymentId: string, uid: string) {
    const p = this.payments.get(paymentId) ?? { uid, status: "approved" };
    if (p.status === "completed") return false;
    this.payments.set(paymentId, { uid, status: "completed" });
    return true;
  }
  async extend(uid: string, days: number) {
    const now = Date.now();
    const cur = this.passes.get(uid)?.getTime() ?? 0;
    const d = new Date(Math.max(now, cur) + days * 86_400_000);
    this.passes.set(uid, d);
    return d;
  }
}

/** Accès à Supabase via son API REST (PostgREST), avec la clé de service : uniquement côté serveur. */
export class SupabasePassStore implements PassStore {
  private readonly base: string;
  constructor(
    url: string,
    private readonly key: string,
    private readonly fetchFn: typeof fetch,
  ) {
    this.base = url.replace(/\/+$/, "") + "/rest/v1";
  }
  private async call(method: string, path: string, body?: unknown, prefer?: string): Promise<unknown> {
    let r: globalThis.Response;
    try {
      r = await this.fetchFn(this.base + path, {
        method,
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.key}`,
          "content-type": "application/json",
          ...(prefer ? { Prefer: prefer } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      console.warn("[pass] base de données injoignable");
      throw new AppError("UPSTREAM_ERROR", "Base de données indisponible pour le moment.", 502);
    }
    if (!r.ok) {
      console.warn(`[pass] base de données ${method} ${path.split("?")[0]} ${r.status}`);
      throw new AppError("UPSTREAM_ERROR", "Base de données indisponible pour le moment.", 502);
    }
    const text = await r.text();
    return text ? (JSON.parse(text) as unknown) : null;
  }
  async getExpiry(uid: string) {
    const rows = (await this.call("GET", `/passes?pi_uid=eq.${encodeURIComponent(uid)}&select=expires_at`)) as { expires_at: string }[] | null;
    return rows && rows[0] ? new Date(rows[0].expires_at) : null;
  }
  async recordApproved(paymentId: string, uid: string, amount: number) {
    await this.call("POST", "/payments?on_conflict=payment_id", [{ payment_id: paymentId, pi_uid: uid, amount }], "resolution=ignore-duplicates,return=minimal");
  }
  async markCompleted(paymentId: string, uid: string, txid: string) {
    // S'assure que la ligne existe (reprise d'un paiement approuvé avant un redémarrage), puis la passe à « completed » une seule fois.
    await this.call("POST", "/payments?on_conflict=payment_id", [{ payment_id: paymentId, pi_uid: uid, amount: 0.0001 }], "resolution=ignore-duplicates,return=minimal");
    const rows = (await this.call(
      "PATCH",
      `/payments?payment_id=eq.${encodeURIComponent(paymentId)}&pi_uid=eq.${encodeURIComponent(uid)}&status=neq.completed`,
      { status: "completed", txid, completed_at: new Date().toISOString() },
      "return=representation",
    )) as unknown[] | null;
    return Array.isArray(rows) && rows.length > 0;
  }
  async extend(uid: string, days: number) {
    const cur = (await this.getExpiry(uid))?.getTime() ?? 0;
    const d = new Date(Math.max(Date.now(), cur) + days * 86_400_000);
    await this.call("POST", "/passes?on_conflict=pi_uid", [{ pi_uid: uid, expires_at: d.toISOString(), updated_at: new Date().toISOString() }], "resolution=merge-duplicates,return=minimal");
    return d;
  }
}

export const PASS_PURPOSE = "pass-30j";
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{6,128}$/);
const approveBody = z.object({ paymentId: idSchema });
const completeBody = z.object({ paymentId: idSchema, txid: z.string().regex(/^[A-Za-z0-9]{16,128}$/) });

export function expectedNetwork(c: Config): string {
  void c;
  return "Pi Network";
}

export function passEnabled(c: Config): boolean {
  return c.PASS_ENABLED === "1" && !!c.PI_API_KEY && !!c.SUPABASE_URL && !!c.SUPABASE_SERVICE_KEY;
}

export interface PassDeps {
  config: Config;
  fetchFn: typeof fetch;
  store: PassStore;
  limiter: express.RequestHandler;
}

export function createPassRouter(deps: PassDeps): Router {
  const { config, fetchFn, store } = deps;
  const base = config.PI_API_BASE.replace(/\/+$/, "");
  const r = express.Router();
  const enabled = passEnabled(config);
  const price = config.PASS_PRICE_PI;
  const days = config.PASS_DAYS;

  async function platform<T>(method: "GET" | "POST", p: string, body?: unknown): Promise<T> {
    let resp: globalThis.Response;
    try {
      resp = await fetchFn(`${base}${p}`, {
        method,
        headers: { Authorization: `Key ${config.PI_API_KEY ?? ""}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AppError("UPSTREAM_ERROR", "Service Pi injoignable pour le moment.", 502);
    }
    if (!resp.ok) {
      const j = (await resp.json().catch(() => null)) as { error?: string } | null;
      console.warn(`[pass] API Pi ${method} ${p.replace(/[A-Za-z0-9_-]{12,}/g, "{id}")} ${resp.status} ${typeof j?.error === "string" ? j.error.slice(0, 60) : ""}`);
      throw new AppError("UPSTREAM_ERROR", "Le service Pi a refusé l'opération.", 502);
    }
    return (await resp.json()) as T;
  }

  async function userFrom(token: string): Promise<string> {
    let resp: globalThis.Response;
    try {
      resp = await fetchFn(`${base}/v2/me`, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    } catch {
      throw new AppError("UPSTREAM_ERROR", "Vérification Pi impossible pour le moment.", 502);
    }
    if (resp.status === 401 || resp.status === 403) throw new AppError("UNAUTHORIZED", "Jeton Pi refusé : reconnectez-vous.", 401);
    if (!resp.ok) throw new AppError("UPSTREAM_ERROR", "Vérification Pi impossible pour le moment.", 502);
    const me = z.object({ uid: z.string().min(1) }).safeParse(await resp.json().catch(() => null));
    if (!me.success) throw new AppError("UPSTREAM_ERROR", "Réponse Pi inattendue.", 502);
    return me.data.uid;
  }
  const bearer = (req: express.Request): string | null => /^Bearer\s+(\S{10,4096})$/.exec(req.headers.authorization ?? "")?.[1] ?? null;
  async function authUser(req: express.Request): Promise<string> {
    const t = bearer(req);
    if (!t) throw new AppError("UNAUTHORIZED", "Connexion Pi requise.", 401);
    return userFrom(t);
  }
  const need = () => {
    if (!enabled) throw new AppError("NOT_FOUND", "Le pass n'est pas disponible.", 404);
  };

  /** Offre publique + état du compte si un jeton valide est fourni. */
  r.get("/status", deps.limiter, async (req, res, next) => {
    try {
      const out: { enabled: boolean; price: number; days: number; active?: boolean; expiresAt?: string | null } = { enabled, price, days };
      if (enabled && bearer(req)) {
        const exp = await store.getExpiry(await authUser(req));
        out.active = !!exp && exp.getTime() > Date.now();
        out.expiresAt = exp ? exp.toISOString() : null;
      }
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  async function check(paymentId: string, uid: string): Promise<PaymentDTO> {
    const p = await platform<PaymentDTO>("GET", `/v2/payments/${paymentId}`);
    if (p.identifier !== paymentId || p.user_uid !== uid) throw new AppError("UNAUTHORIZED", "Ce paiement n'appartient pas à ce compte.", 403);
    if (p.direction !== "user_to_app") throw new AppError("INVALID_INPUT", "Sens de paiement inattendu.", 400);
    if (p.network !== expectedNetwork(config)) throw new AppError("INVALID_INPUT", "Réseau de paiement inattendu.", 400);
    if (p.metadata?.purpose !== PASS_PURPOSE) throw new AppError("INVALID_INPUT", "Paiement non reconnu.", 400);
    if (Math.abs(p.amount - price) > 1e-9) throw new AppError("INVALID_INPUT", "Montant inattendu.", 400);
    if (p.status.cancelled || p.status.user_cancelled) throw new AppError("INVALID_INPUT", "Paiement annulé.", 409);
    return p;
  }

  r.post("/approve", deps.limiter, express.json({ limit: "4kb" }), async (req, res, next) => {
    try {
      need();
      const uid = await authUser(req);
      const b = approveBody.safeParse(req.body);
      if (!b.success) throw new AppError("INVALID_INPUT", "Identifiant de paiement invalide.", 400);
      const p = await check(b.data.paymentId, uid);
      await store.recordApproved(b.data.paymentId, uid, p.amount);
      if (!p.status.developer_approved) await platform("POST", `/v2/payments/${b.data.paymentId}/approve`);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.post("/complete", deps.limiter, express.json({ limit: "4kb" }), async (req, res, next) => {
    try {
      need();
      const uid = await authUser(req);
      const b = completeBody.safeParse(req.body);
      if (!b.success) throw new AppError("INVALID_INPUT", "Données de paiement invalides.", 400);
      const p = await check(b.data.paymentId, uid);
      if (!p.transaction || p.transaction.txid !== b.data.txid) throw new AppError("INVALID_INPUT", "Transaction non concordante.", 400);
      if (!p.status.developer_completed) await platform("POST", `/v2/payments/${b.data.paymentId}/complete`, { txid: b.data.txid });
      // Le pass n'est accordé qu'une fois par paiement, même si « complete » arrive deux fois.
      const first = await store.markCompleted(b.data.paymentId, uid, b.data.txid);
      const expiry = first ? await store.extend(uid, days) : await store.getExpiry(uid);
      if (first) console.log("[pass] accordé");
      res.json({ ok: true, active: !!expiry && expiry.getTime() > Date.now(), expiresAt: expiry ? expiry.toISOString() : null });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
