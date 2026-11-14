import { dailyFoodInr, SPEND_TIERS, type SpendPrices, type SpendTier } from "@/lib/spending/prices";

/**
 * How dear a trip's meals and nights out should be, from what its budget
 * leaves for them.
 *
 * The flights, hotels, transfers and local transport are worked out first.
 * What the budget has left after them, per person per day, is the trip's
 * spending money. Most of it goes on food and a smaller share on nights out;
 * the last tenth is left for entry tickets and shopping, which the estimate
 * mostly can't see in advance. Each gets the dearest tier that fits its
 * share. When even the cheapest meals don't fit, meals are still planned at
 * the cheapest tier (a trip needs food) and the budget shows as tight; a night
 * out that doesn't fit is simply left out.
 *
 * With no budget to go by, both are mid-range, as a hotel is.
 */

/** The share of the daily spending money food may take. */
export const FOOD_SHARE_OF_SPENDING = 0.7;
/** The share a night out may take. */
export const NIGHTLIFE_SHARE_OF_SPENDING = 0.2;

export interface SpendingPlan {
  /** The tier the day's meals are chosen from. */
  food: SpendTier;
  /** The tier a night out is chosen from, or null when the budget leaves no room for one. */
  nightlife: SpendTier | null;
}

/** The dearest tier whose cost fits `limit`, or null when none does. */
function dearestWithin(limit: number, costOf: (tier: SpendTier) => number): SpendTier | null {
  for (const tier of [...SPEND_TIERS].reverse()) {
    if (costOf(tier) <= limit) return tier;
  }
  return null;
}

/**
 * `perPersonPerDayInr`: what the budget leaves per person per day after the
 * fixed costs, in rupees. Null (or not a number) when there is no budget to go by.
 */
export function chooseSpending(perPersonPerDayInr: number | null, prices: SpendPrices): SpendingPlan {
  if (perPersonPerDayInr === null || !Number.isFinite(perPersonPerDayInr)) {
    return { food: "mid", nightlife: "mid" };
  }
  const food = dearestWithin(perPersonPerDayInr * FOOD_SHARE_OF_SPENDING, (tier) => dailyFoodInr(tier, prices)) ?? "budget";
  const nightlife = dearestWithin(perPersonPerDayInr * NIGHTLIFE_SHARE_OF_SPENDING, (tier) => prices.perPersonInr[tier]);
  return { food, nightlife };
}
