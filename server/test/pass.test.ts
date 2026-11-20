import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { AppError } from "../src/errors.js";
import { createPassRouter, MemoryPassStore, SupabasePassStore, type PaymentDTO } from "../src/pass.js";

const TOKEN = "token-token-token";
const PID = "payment-abc-123";
const TX = "abcdef0123456789abcdef";

function payment(over: Partial<PaymentDTO> = {}): PaymentDTO {
  return {
    identifier: PID,
    user_uid: "u-1",
    amount: 0.5,
    metadata: { purpose: "pass-30j" },
    direction: "user_to_app",
    network: "Pi Network",
    status: { developer_approved: false, transaction_verified: true, developer_completed: false, cancelled: false, user_cancelled: false },
    transaction: { txid: TX, verified: true },
    ...over,
  };
}

function build(opts: { env?: Record<string, string>; pay?: PaymentDTO } = {}) {
  const store = new MemoryPassStore();
  const calls: string[] = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method ?? "GET"} ${u.replace("https://api.minepi.com", "")}`);
    if (u.endsWith("/v2/me")) return new Response(JSON.stringify({ uid: "u-1", username: "alice" }), { status: 200 });
    if (u.endsWith(`/v2/payments/${PID}`)) return new Response(JSON.stringify(opts.pay ?? payment()), { status: 200 });
    return new Response("{}", { status: 200 }); // approve / complete
  });
  const config = loadConfig({
    PASS_ENABLED: "1",
    PI_API_KEY: "cle-de-test-pas-secrete",
    SUPABASE_URL: "https://exemple.supabase.co",
    SUPABASE_SERVICE_KEY: "service-key-de-test-0123456789",
    CLIENT_DIST: "/nonexistent",
    ...opts.env,
  });
  const app = express();
  app.use("/pass", createPassRouter({ config, fetchFn: fetchFn as unknown as typeof fetch, store, limiter: (_q, _s, n) => n() }));
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) res.status(err.status).json({ error: { code: err.code, message: err.message } });
    else res.status(500).json({ error: { code: "INTERNAL", message: "erreur" } });
  });
  return { app, store, calls };
}
const auth = { Authorization: `Bearer ${TOKEN}` };

describe("pass payant", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("status : offre publique, puis état du compte avec un jeton", async () => {
    const pub = await request(ctx.app).get("/pass/status");
    expect(pub.body).toEqual({ enabled: true, price: 0.5, days: 30 });
    const me = await request(ctx.app).get("/pass/status").set(auth);
    expect(me.body).toMatchObject({ enabled: true, active: false, expiresAt: null });
  });

  it("désactivé (drapeau ou clé manquante) → routes 404", async () => {
    for (const env of [{ PASS_ENABLED: "0" }, { SUPABASE_SERVICE_KEY: "" }]) {
      const c = build({ env: env as unknown as Record<string, string> });
      expect((await request(c.app).post("/pass/approve").set(auth).send({ paymentId: PID })).status).toBe(404);
    }
  });

  it("approve : refuse sans connexion, mauvais montant, mauvais propriétaire, mauvais réseau, mauvais objet", async () => {
    expect((await request(ctx.app).post("/pass/approve").send({ paymentId: PID })).status).toBe(401);
    for (const bad of [{ amount: 0.1 }, { user_uid: "u-2" }, { network: "Pi Réseau Autre" }, { metadata: { purpose: "autre" } }, { direction: "app_to_user" as const }]) {
      const c = build({ pay: payment(bad) });
      const res = await request(c.app).post("/pass/approve").set(auth).send({ paymentId: PID });
      expect(res.status, JSON.stringify(bad)).toBeGreaterThanOrEqual(400);
      expect(c.calls.some((x) => x.includes("/approve"))).toBe(false);
    }
  });

  it("approve : paiement conforme → approuvé côté Pi et enregistré", async () => {
    const res = await request(ctx.app).post("/pass/approve").set(auth).send({ paymentId: PID });
    expect(res.status).toBe(200);
    expect(ctx.calls).toContain(`POST /v2/payments/${PID}/approve`);
    expect(ctx.store.payments.get(PID)?.status).toBe("approved");
  });

  it("complete : accorde 30 jours, une seule fois même si l'appel est reçu deux fois", async () => {
    const r1 = await request(ctx.app).post("/pass/complete").set(auth).send({ paymentId: PID, txid: TX });
    expect(r1.status).toBe(200);
    expect(r1.body.active).toBe(true);
    const first = new Date(r1.body.expiresAt).getTime();
    const days = (first - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThan(30.01);
    const r2 = await request(ctx.app).post("/pass/complete").set(auth).send({ paymentId: PID, txid: TX });
    expect(r2.status).toBe(200);
    expect(new Date(r2.body.expiresAt).getTime()).toBe(first); // pas de seconde prolongation
  });

  it("complete : refuse une transaction qui ne correspond pas", async () => {
    const res = await request(ctx.app).post("/pass/complete").set(auth).send({ paymentId: PID, txid: "zzzzzzzzzzzzzzzzzzzzzz" });
    expect(res.status).toBe(400);
    expect(ctx.store.passes.size).toBe(0);
  });

  it("un deuxième paiement prolonge à partir de l'échéance (pas de perte)", async () => {
    await ctx.store.extend("u-1", 30);
    const before = (await ctx.store.getExpiry("u-1"))!.getTime();
    const after = (await ctx.store.extend("u-1", 30)).getTime();
    expect(after - before).toBe(30 * 86_400_000);
  });
});

describe("SupabasePassStore", () => {
  it("n'envoie la clé de service qu'à l'adresse Supabase configurée, avec les bons filtres", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response("[]", { status: 200 }));
    const s = new SupabasePassStore("https://exemple.supabase.co/", "service-key-de-test-0123456789", f as unknown as typeof fetch);
    await s.getExpiry("u 1&x");
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://exemple.supabase.co/rest/v1/passes?pi_uid=eq.u%201%26x&select=expires_at");
    expect((init.headers as Record<string, string>).apikey).toBe("service-key-de-test-0123456789");
  });

  it("markCompleted : vrai la première fois seulement", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 201 })) // insert si absent
      .mockResolvedValueOnce(new Response(JSON.stringify([{ payment_id: "p" }]), { status: 200 })) // 1 ligne modifiée
      .mockResolvedValueOnce(new Response("", { status: 201 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 })); // 0 ligne : déjà terminé
    const s = new SupabasePassStore("https://exemple.supabase.co", "service-key-de-test-0123456789", f as unknown as typeof fetch);
    expect(await s.markCompleted("p", "u", "tx")).toBe(true);
    expect(await s.markCompleted("p", "u", "tx")).toBe(false);
  });

  it("erreur de la base → 502 sans divulguer la clé", async () => {
    const f = vi.fn(async () => new Response("boom service-key-de-test-0123456789", { status: 500 }));
    const s = new SupabasePassStore("https://exemple.supabase.co", "service-key-de-test-0123456789", f as unknown as typeof fetch);
    await expect(s.getExpiry("u")).rejects.toMatchObject({ status: 502 });
  });
});
