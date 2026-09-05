/**
 * Static, approximate conversion rates used only so the mock generator can
 * produce numbers in whatever currency the user picked. These are NOT live
 * exchange rates — every amount in the app is demo/estimated data until a
 * real pricing or FX provider is wired in.
 */
const RATES_PER_INR: Record<string, number> = {
  INR: 1,
  USD: 1 / 83,
  EUR: 1 / 90,
  GBP: 1 / 105,
};

export function fromInr(amountInInr: number, currency: string): number {
  const rate = RATES_PER_INR[currency] ?? 1;
  return Math.round(amountInInr * rate);
}
