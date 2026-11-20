import { z } from "zod";

export type AppEnv = "mainnet";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.string().default("development"),
  /** Environnement Pi de CETTE instance. Le réseau réel se choisit dans le Developer Portal. */
  APP_ENV: z.literal("mainnet").default("mainnet"),

  /**
   * La valeur du Pi n'est pas encore disponible : tant que ce drapeau est à 0 (défaut), l'application
   * affiche « à venir » et n'interroge aucune source de prix. Passer à 1 réactive les conversions de marché.
   */
  /** Mode « sandbox » du SDK Pi (adresse de développement du portail, sandbox.minepi.com). 0 par défaut. */
  PI_SANDBOX: z.enum(["0", "1"]).default("0"),
  PI_VALUE_AVAILABLE: z.enum(["0", "1"]).default("0"),

  COINGECKO_BASE_URL: z.string().url().default("https://api.coingecko.com/api/v3"),
  COINGECKO_API_KEY: z.string().min(1).optional(),
  /** Demo : x-cg-demo-api-key (api.coingecko.com) · Pro : x-cg-pro-api-key (pro-api.coingecko.com). */
  COINGECKO_KEY_HEADER: z.string().min(1).default("x-cg-demo-api-key"),
  COINGECKO_COIN_ID: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default("pi-network"),

  FX_URL: z.string().url().default("https://open.er-api.com/v6/latest/USD"),

  PRICE_TTL_SECONDS: z.coerce.number().int().min(10).default(60),
  PRICE_MAX_STALE_SECONDS: z.coerce.number().int().min(10).default(900),
  PRICE_SOURCE_MAX_AGE_SECONDS: z.coerce.number().int().min(60).default(1800),
  FX_TTL_SECONDS: z.coerce.number().int().min(60).default(3600),
  FX_MAX_STALE_SECONDS: z.coerce.number().int().min(60).default(172800),
  FX_SOURCE_MAX_AGE_SECONDS: z.coerce.number().int().min(60).default(129600),

  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(90),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  PI_API_BASE: z.string().url().default("https://api.minepi.com"),
  /** Contenu du fichier /validation-key.txt fourni par le Developer Portal (vérification du domaine). */
  PI_VALIDATION_KEY: z.string().min(1).optional(),
  FRAME_ANCESTORS: z.string().default("'self' https://*.minepi.com https://*.pinet.com"),
  CLIENT_DIST: z.string().optional(),

  /** Clé API de CETTE application (Developer Portal Mainnet). Uniquement dans les variables de l'hébergeur. */
  PI_API_KEY: z.string().min(1).optional(),
  /**
   * Pass payant (paiement utilisateur → application, montant fixe en Pi fixé par le serveur). Fermé par défaut.
   * Exige PI_API_KEY, SUPABASE_URL et SUPABASE_SERVICE_KEY. À n'activer que lorsque le service livre réellement ce que le pass donne.
   */
  PASS_ENABLED: z.enum(["0", "1"]).default("0"),
  PASS_PRICE_PI: z.coerce.number().positive().max(20).default(0.5),
  PASS_DAYS: z.coerce.number().int().min(1).max(366).default(30),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().min(20).optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Une variable vide est traitée comme absente.
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && v.trim() !== "") cleaned[k] = v.trim();
  }
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuration invalide : ${details}`);
  }
  return parsed.data;
}
