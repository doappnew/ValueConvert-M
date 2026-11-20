import { describe, expect, it } from "vitest";
import type { ConvertResponse } from "../types";
import { displayResult, formatDecimal, formatWhen, normalizeAmountInput } from "./format";

describe("formatDecimal", () => {
  it("groupe les milliers et utilise la virgule", () => {
    expect(formatDecimal("31415900")).toBe("31 415 900");
    expect(formatDecimal("12.5")).toBe("12,5");
    expect(formatDecimal("1234567.891")).toBe("1 234 567,891");
  });
  it("n'altère pas les très grands nombres (pas de perte de précision)", () => {
    expect(formatDecimal("314159000000000000")).toBe("314 159 000 000 000 000");
    expect(formatDecimal("123456789012345678.5")).toBe("123 456 789 012 345 678,5");
  });
  it("respecte les décimales minimales et retire les zéros inutiles", () => {
    expect(formatDecimal("2.00", { minFraction: 2 })).toBe("2,00");
    expect(formatDecimal("100.0000000")).toBe("100");
    expect(formatDecimal("12000", { minFraction: 0 })).toBe("12 000");
  });
});

describe("normalizeAmountInput", () => {
  it.each([
    ["100", "100"],
    ["1 000,5", "1000.5"],
    ["12,5", "12.5"],
    ["0,25", "0.25"],
    [".5", "0.5"],
    ["007", "7"],
    ["1 000", "1000"],
  ])("accepte %j → %j", (raw, value) => {
    expect(normalizeAmountInput(raw)).toEqual({ value });
  });

  it.each([
    ["", "EMPTY"],
    ["abc", "INVALID"],
    ["-5", "INVALID"],
    ["1e5", "INVALID"],
    [".", "INVALID"],
    ["1.2.3", "INVALID"],
    ["0", "ZERO"],
    ["0,000", "ZERO"],
    ["1000000000001", "TOO_LARGE"],
    ["99999999999999", "TOO_LARGE"],
    ["1,1234567890123", "TOO_PRECISE"],
  ])("refuse %j (%s)", (raw, error) => {
    expect(normalizeAmountInput(raw)).toEqual({ value: null, error });
  });
});

const base: ConvertResponse = {
  direction: "pi_to_fiat",
  amount: "100",
  currency: { code: "XOF", name: "Franc CFA (BCEAO)", decimals: 0 },
  result: "12000",
  resultPrecise: "12000.0000000000",
  priceUsd: "0.2",
  usdToFiat: "600",
  unitPriceFiat: "120.00",
  sources: { price: null, fx: null },
  dataState: "live",
  disclaimer: "",
};

describe("displayResult", () => {
  it("affiche le résultat arrondi avec les décimales de la monnaie", () => {
    expect(displayResult(base)).toBe("12 000");
    expect(displayResult({ ...base, currency: { code: "USD", name: "", decimals: 2 }, result: "2.00" })).toBe("2,00");
  });
  it("affiche la valeur précise quand l'arrondi donne 0", () => {
    expect(displayResult({ ...base, result: "0", resultPrecise: "0.0004000000" })).toBe("≈ 0,0004");
  });
  it("affiche un montant en Pi avec au moins 2 décimales", () => {
    expect(displayResult({ ...base, direction: "fiat_to_pi", result: "100.0000000" })).toBe("100,00");
  });
});

describe("formatWhen", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  it("exprime l'ancienneté", () => {
    expect(formatWhen("2026-11-19T11:57:00Z", now)).toMatch(/^il y a 3 min/);
    expect(formatWhen("2026-11-19T09:00:00Z", now)).toMatch(/^il y a 3 h/);
    expect(formatWhen("2026-11-19T11:59:50Z", now)).toMatch(/^à l'instant/);
  });
  it("gère l'absence d'heure", () => {
    expect(formatWhen(null, now)).toBe("heure inconnue");
    expect(formatWhen("pas une date", now)).toBe("heure inconnue");
  });
});
