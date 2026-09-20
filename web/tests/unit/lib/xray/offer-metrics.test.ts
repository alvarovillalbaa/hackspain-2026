import { describe, expect, it } from "vitest";
import {
  EMBAT_ORIGINATION_RATE,
  annualInterestSaving,
  embatOriginationFee,
  loanTotal,
  scoreImprovement,
} from "./offer-metrics";

describe("annualInterestSaving", () => {
  it("resta el tipo de la oferta al tipo actual sobre el ticket", () => {
    expect(annualInterestSaving(500_000, 0.065, 0.045)).toBe(10_000);
  });

  it("devuelve 0 si no hay tipo actual", () => {
    expect(annualInterestSaving(500_000, null, 0.045)).toBe(0);
  });

  it("puede ser negativo si la oferta es más cara", () => {
    expect(annualInterestSaving(100_000, 0.04, 0.06)).toBe(-2_000);
  });
});

describe("embatOriginationFee", () => {
  it("aplica el 3 % del ticket", () => {
    expect(EMBAT_ORIGINATION_RATE).toBe(0.03);
    expect(embatOriginationFee(500_000)).toBe(15_000);
  });
});

describe("loanTotal", () => {
  it("suma el fee de originación al ticket", () => {
    expect(loanTotal(500_000)).toBe(515_000);
  });
});

describe("scoreImprovement", () => {
  it("redondea el uplift a entero de ficha", () => {
    expect(scoreImprovement(2.7)).toBe(3);
    expect(scoreImprovement(1.2)).toBe(1);
  });
});
