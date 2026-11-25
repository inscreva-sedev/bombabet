export const GROWTH_RATE = 0.000068; // Default exponential growth constant per ms

export function calculateMultiplier(
  elapsedMs: number,
  growthRate = GROWTH_RATE
): number {
  if (elapsedMs <= 0) return 1.0;
  const raw = Math.exp(growthRate * elapsedMs);
  return Math.max(1.0, Math.floor(raw * 100) / 100);
}

export function calculatePayout(betAmount: number, multiplier: number): number {
  return Math.round(betAmount * multiplier * 100) / 100;
}
