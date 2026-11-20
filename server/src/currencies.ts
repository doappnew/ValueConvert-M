export interface Currency {
  /** Code ISO 4217 */
  code: string;
  /** Nom affiché (français) */
  name: string;
  /** Nombre de décimales de la monnaie (ISO 4217) */
  decimals: number;
}

/**
 * Devises proposées. Le code est vérifié à chaque requête : si la source de taux
 * ne fournit pas une devise à un instant donné, l'API répond CURRENCY_UNAVAILABLE.
 * (SLE remplace l'ancien SLL, retiré de la liste initiale.)
 */
export const CURRENCIES: readonly Currency[] = [
  { code: "USD", name: "Dollar américain", decimals: 2 },
  { code: "EUR", name: "Euro", decimals: 2 },
  { code: "XOF", name: "Franc CFA (BCEAO)", decimals: 0 },
  { code: "XAF", name: "Franc CFA (BEAC)", decimals: 0 },
  { code: "NGN", name: "Naira nigérian", decimals: 2 },
  { code: "GHS", name: "Cedi ghanéen", decimals: 2 },
  { code: "KES", name: "Shilling kényan", decimals: 2 },
  { code: "ZAR", name: "Rand sud-africain", decimals: 2 },
  { code: "GMD", name: "Dalasi gambien", decimals: 2 },
  { code: "GNF", name: "Franc guinéen", decimals: 0 },
  { code: "LRD", name: "Dollar libérien", decimals: 2 },
  { code: "SLE", name: "Leone sierra-léonais", decimals: 2 },
  { code: "MRU", name: "Ouguiya mauritanien", decimals: 2 },
  { code: "MAD", name: "Dirham marocain", decimals: 2 },
  { code: "DZD", name: "Dinar algérien", decimals: 2 },
  { code: "TND", name: "Dinar tunisien", decimals: 3 },
  { code: "EGP", name: "Livre égyptienne", decimals: 2 },
  { code: "GBP", name: "Livre sterling", decimals: 2 },
  { code: "CHF", name: "Franc suisse", decimals: 2 },
  { code: "CAD", name: "Dollar canadien", decimals: 2 },
  { code: "AUD", name: "Dollar australien", decimals: 2 },
  { code: "INR", name: "Roupie indienne", decimals: 2 },
  { code: "CNY", name: "Yuan renminbi", decimals: 2 },
  { code: "JPY", name: "Yen japonais", decimals: 0 },
  { code: "BRL", name: "Réal brésilien", decimals: 2 },
  { code: "AED", name: "Dirham des Émirats arabes unis", decimals: 2 },
  { code: "SAR", name: "Riyal saoudien", decimals: 2 },
  { code: "ETB", name: "Birr éthiopien", decimals: 2 },
  { code: "UGX", name: "Shilling ougandais", decimals: 0 },
  { code: "TZS", name: "Shilling tanzanien", decimals: 2 },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function getCurrency(code: string): Currency | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/** Le Pi s'exprime avec 7 décimales sur la blockchain. */
export const PI_DECIMALS = 7;
