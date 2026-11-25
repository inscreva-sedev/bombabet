export function formatMoney(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}x`;
}

export function getMultiplierBadgeColor(multiplier: number): string {
  if (multiplier >= 10) {
    return 'text-[#e938a3]';
  }
  if (multiplier >= 2) {
    return 'text-[#9d5cf6]';
  }
  return 'text-[#3999f7]';
}

export function getMultiplierPillStyle(multiplier: number): string {
  if (multiplier >= 10) {
    return 'text-[#e938a3] bg-[#2a1728] border-[#59234f]';
  }
  if (multiplier >= 2) {
    return 'text-[#a36bf7] bg-[#221a35] border-[#3d2b66]';
  }
  return 'text-[#44a0f7] bg-[#162235] border-[#263f66]';
}

export function clampBetAmount(amount: number): number {
  if (!Number.isFinite(amount) || Number.isNaN(amount)) return 1.0;
  const rounded = Math.round(amount * 100) / 100;
  return Math.min(10000, Math.max(0.1, rounded));
}

export function clampAutoCashout(multiplier: number): number {
  if (!Number.isFinite(multiplier) || Number.isNaN(multiplier)) return 2.0;
  const rounded = Math.round(multiplier * 100) / 100;
  return Math.min(1000, Math.max(1.01, rounded));
}
