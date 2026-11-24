export const MARKUP_MULTIPLIER = 2;

export const TOPUP_PACKS_USD = [10, 25, 50] as const;

export const EXCLUSIVE_DURATION_HOURS = [6, 24, 72, 168] as const;
export type ExclusiveDurationHours = (typeof EXCLUSIVE_DURATION_HOURS)[number];

export function dollarsToCents(amountUsd: number): number {
  if (!Number.isFinite(amountUsd) || amountUsd < 0) {
    throw new Error(`Invalid USD amount: ${amountUsd}`);
  }
  return Math.round(amountUsd * 100);
}

export function calculateRetailCents(wholesaleCents: number): number {
  if (!Number.isInteger(wholesaleCents) || wholesaleCents < 0) {
    throw new Error(`Invalid wholesale cents: ${wholesaleCents}`);
  }
  return Math.round(wholesaleCents * MARKUP_MULTIPLIER);
}

export function calculateProfitCents(retailCents: number, wholesaleCents: number): number {
  return retailCents - wholesaleCents;
}

export function formatCents(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return `$${(safe / 100).toFixed(2)}`;
}

export function formatDurationLabel(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? "24h (1 day)" : `${days} days`;
  }
  return `${hours}h`;
}