import express, { type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Config } from "./config.js";
import { createPassRouter, SupabasePassStore, MemoryPassStore, type PassStore } from "./pass.js";
import { AppError } from "./errors.js";
import { CURRENCIES } from "./currencies.js";
import type { MarketService } from "./market.js";

export interface AppDeps {
  passStore?: PassStore;
  config: Config;
  market: MarketService;
  fetchFn?: typeof fetch;
}

const convertQuery = z.object({
  direction: z.enum(["pi_to_fiat", "fiat_to_pi"], { errorMap: () => ({ message: "Sens de conversion invalide." }) }),
  amount: z.string({ required_error: "Montant requis." }).max(40),
  currency: z.string({ required_error: "Devise requise." }).regex(/^[A-Za-z]{3}$/, "Code de devise invalide."),
});

const piVerifyBody = z.object({ accessToken: z.string().min(10).max(4096) });
const piMeSchema = z.object({ uid: z.string().min(1), username: z.string().min(1).optional() });

function firstIssue(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Requête invalide.";
}

export function createApp({ config, market, fetchFn = fetch, passStore }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);

  const frameAncestors = config.FRAME_ANCESTORS.split(/\s+/).filter(Boolean);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://sdk.minepi.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "https://*.minepi.com", "https://socialchain.app"],
          frameSrc: ["https://*.minepi.com"],
          frameAncestors,
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      // Le contrôle du cadrage passe par la directive CSP frame-ancestors ci-dessus.
      frameguard: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: config.RATE_LIMIT_PER_MINUTE,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "Trop de requêtes. Réessayez dans un instant." } });
    },
  });
  const strictLimiter = rateLimit({
    windowMs: 60_000,
    limit: 15,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "Trop de tentatives. Réessayez dans un instant." } });
    },
  });

  const api = express.Router();
  api.use(limiter);
  api.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  api.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  api.get("/config", (_req, res) => {
    res.json({ appName: "ValueConvert", env: config.APP_ENV, piValueAvailable: config.PI_VALUE_AVAILABLE === "1", piSandbox: config.PI_SANDBOX === "1" });
  });

  api.get("/currencies", (_req, res) => {
    res.json({ currencies: CURRENCIES });
  });

  api.get("/status", async (_req, res, next) => {
    try {
      res.json(await market.status({ withPrice: config.PI_VALUE_AVAILABLE === "1" }));
    } catch (e) {
      next(e);
    }
  });

  api.get("/convert", async (req, res, next) => {
    try {
      const q = convertQuery.safeParse(req.query);
      if (!q.success) throw new AppError("INVALID_INPUT", firstIssue(q.error), 400);
      if (config.PI_VALUE_AVAILABLE !== "1") {
        // Valeur du Pi pas encore disponible : aucun calcul, aucun prix, aucune source interrogée.
        res.json({ available: false, message: "La valeur du Pi est à venir : elle n'est pas encore disponible." });
        return;
      }
      res.json(
        await market.convert({
          direction: q.data.direction,
          amount: q.data.amount,
          currency: q.data.currency,
        }),
      );
    } catch (e) {
      next(e);
    }
  });

  /**
   * Connexion Pi facultative : le navigateur n'envoie QUE le jeton d'accès ; l'identité est
   * vérifié côté serveur auprès de la Platform API (GET /v2/me). Aucune clé API n'est nécessaire.
   */
  api.post("/pi/verify", strictLimiter, express.json({ limit: "8kb" }), async (req, res, next) => {
    try {
      const body = piVerifyBody.safeParse(req.body);
      if (!body.success) throw new AppError("INVALID_INPUT", "Jeton manquant ou invalide.", 400);
      let r: globalThis.Response;
      try {
        r = await fetchFn(`${config.PI_API_BASE.replace(/\/+$/, "")}/v2/me`, {
          headers: { Authorization: `Bearer ${body.data.accessToken}`, accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        console.warn("[auth] API Pi /v2/me injoignable");
        throw new AppError("UPSTREAM_ERROR", "Vérification Pi impossible pour le moment.", 502);
      }
      if (r.status === 401 || r.status === 403) {
        console.warn(`[auth] API Pi /v2/me ${r.status} : jeton refusé`);
        throw new AppError("UNAUTHORIZED", "Jeton Pi refusé.", 401);
      }
      if (!r.ok) {
        console.warn(`[auth] API Pi /v2/me ${r.status}`);
        throw new AppError("UPSTREAM_ERROR", "Vérification Pi impossible pour le moment.", 502);
      }
      const me = piMeSchema.safeParse(await r.json().catch(() => null));
      if (!me.success) throw new AppError("UPSTREAM_ERROR", "Réponse Pi inattendue.", 502);
      console.log("[auth] connexion vérifiée");
      res.json({ username: me.data.username ?? null });
    } catch (e) {
      next(e);
    }
  });

  api.use(
    "/pass",
    createPassRouter({
      config,
      fetchFn,
      limiter: strictLimiter,
      store:
        passStore ??
        (config.SUPABASE_URL && config.SUPABASE_SERVICE_KEY ? new SupabasePassStore(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, fetchFn) : new MemoryPassStore()),
    }),
  );

  api.use((_req, _res, next) => next(new AppError("NOT_FOUND", "Route introuvable.", 404)));
  app.use("/api", api);

  // Vérification du domaine dans le Pi Developer Portal.
  app.get("/validation-key.txt", (_req, res) => {
    if (!config.PI_VALIDATION_KEY) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    res.type("text/plain").send(config.PI_VALIDATION_KEY);
  });

  // Frontend compilé (production).
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = config.CLIENT_DIST ?? path.resolve(here, "../../client/dist");
  if (fs.existsSync(path.join(dist, "index.html"))) {
    app.use(
      express.static(dist, {
        index: false,
        extensions: ["html"], // /confidentialite et /conditions → pages statiques
        setHeaders: (res, file) => {
          res.setHeader(
            "Cache-Control",
            file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
          );
        },
      }),
    );
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  // Gestion d'erreurs : messages sûrs, aucune trace ni secret renvoyés.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: { code: "INVALID_INPUT", message: "Corps de requête invalide." } });
      return;
    }
    console.error("[erreur interne]", err instanceof Error ? err.message : "inconnue");
    res.status(500).json({ error: { code: "INTERNAL", message: "Erreur interne du serveur." } });
  });

  return app;
}
