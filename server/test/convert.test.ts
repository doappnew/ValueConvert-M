import { describe, expect, it } from "vitest";
import {
  DecimalCtor as D,
  fiatToPi,
  parseAmount,
  piToFiat,
  roundForCurrency,
  roundForPi,
} from "../src/convert.js";
import { AppError } from "../src/errors.js";
import { getCurrency } from "../src/currencies.js";

const XOF = getCurrency("XOF")!;
const TND = getCurrency("TND")!;

describe("parseAmount", () => {
  it("accepte les montants valides", () => {
    expect(parseAmount("100").toString()).toBe("100");
    expect(parseAmount("12.5").toString()).toBe("12.5");
    expect(parseAmount("0.000001").toString()).toBe("0.000001");
    expect(parseAmount("1000000000000").toString()).toBe("1000000000000");
  });

  it.each(["", "abc", "-5", "1e5", "1,5", " 5", "5 ", "0x10", "NaN", "Infinity", "1..2", ".5", "5."])(
    "refuse %j",
    (v) => {
      expect(() => parseAmount(v)).toThrow(AppError);
    },
  );

  it("refuse zéro", () => {
    expect(() => parseAmount("0")).toThrow(/supérieur à 0/);
    expect(() => parseAmount("0.000")).toThrow(AppError);
  });

  it("refuse un montant au-delà de la limite", () => {
    expect(() => parseAmount("1000000000001")).toThrow(/trop grand/);
    expect(() => parseAmount("99999999999999")).toThrow(AppError);
  });
});

describe("conversions", () => {
  const price = new D("0.2"); // exemple de test
  const rate = new D("600");

  it("Pi → fiat = montant × prix × taux", () => {
    expect(piToFiat(new D("100"), price, rate).toFixed()).toBe("12000");
  });

  it("fiat → Pi = montant ÷ taux ÷ prix", () => {
    expect(fiatToPi(new D("12000"), price, rate).toFixed()).toBe("100");
  });

  it("est cohérent dans les deux sens (aller-retour)", () => {
    const p = new D("0.1739");
    const r = new D("596.371316");
    const fiat = piToFiat(new D("123.4567"), p, r);
    const back = fiatToPi(fiat, p, r);
    expect(back.toDecimalPlaces(10).toFixed()).toBe("123.4567");
  });

  it("n'a pas d'erreur d'arrondi binaire (0,1 + 0,2 style)", () => {
    const v = piToFiat(new D("0.1"), new D("3"), new D("1"));
    expect(v.toFixed()).toBe("0.3");
  });

});

describe("arrondis par devise", () => {
  it("XOF : 0 décimale, arrondi half-up", () => {
    expect(roundForCurrency(new D("10251.5"), XOF).result).toBe("10252");
    expect(roundForCurrency(new D("10251.49"), XOF).result).toBe("10251");
  });
  it("TND : 3 décimales", () => {
    expect(roundForCurrency(new D("1.23456"), TND).result).toBe("1.235");
  });
  it("Pi : 7 décimales", () => {
    expect(roundForPi(new D("1.123456789")).result).toBe("1.1234568");
  });
  it("garde une valeur précise quand l'arrondi donne 0", () => {
    const r = roundForCurrency(new D("0.0004"), XOF);
    expect(r.result).toBe("0");
    expect(r.resultPrecise).toBe("0.0004000000");
  });
});
