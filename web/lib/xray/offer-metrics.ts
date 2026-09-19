/** Comisión de originación Embat sobre el ticket (frame Ofertas de Figma: 15k€ / 500k€). */
export const EMBAT_ORIGINATION_RATE = 0.03;

/** Ahorro anual de intereses: (tipo actual − tipo oferta) × importe. */
export function annualInterestSaving(
  amount: number,
  currentRate: number | null,
  offerRate: number
): number {
  if (currentRate == null) return 0;
  return Math.round(amount * (currentRate - offerRate));
}

export function embatOriginationFee(amount: number): number {
  return Math.round(amount * EMBAT_ORIGINATION_RATE);
}

/** Ticket + comisión Embat (frame Contratar Préstamo: 500k€ + 15k€ = 515k€). */
export function loanTotal(amount: number): number {
  return amount + embatOriginationFee(amount);
}

export function scoreImprovement(uplift: number): number {
  return Math.round(uplift);
}
