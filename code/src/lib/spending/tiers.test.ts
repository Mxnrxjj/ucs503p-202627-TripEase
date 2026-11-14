import { describe, expect, it } from "vitest";
import { dailyFoodInr, spendPricesFor } from "@/lib/spending/prices";
import { chooseSpending, FOOD_SHARE_OF_SPENDING, NIGHTLIFE_SHARE_OF_SPENDING } from "@/lib/spending/tiers";

const india = spendPricesFor("IN");
const p = india.perPersonInr;

/** The spending money per person per day at which food's share is `inr` (a hair over, so rounding can't decide a test). */
const forFood = (inr: number) => inr / FOOD_SHARE_OF_SPENDING + 1e-6;
const forNightlife = (inr: number) => inr / NIGHTLIFE_SHARE_OF_SPENDING + 1e-6;

describe("chooseSpending", () => {
  it("leaves room in the day's money: food and nights out together take less than all of it", () => {
    expect(FOOD_SHARE_OF_SPENDING + NIGHTLIFE_SHARE_OF_SPENDING).toBeLessThan(1);
  });

  it("is mid-range for both when there is no budget to go by", () => {
    expect(chooseSpending(null, india)).toEqual({ food: "mid", nightlife: "mid" });
    expect(chooseSpending(Number.NaN, india)).toEqual({ food: "mid", nightlife: "mid" });
    expect(chooseSpending(Number.POSITIVE_INFINITY, india)).toEqual({ food: "mid", nightlife: "mid" });
  });

  it("gives food the dearest tier whose three meals fit its share, exactly at each boundary", () => {
    expect(chooseSpending(forFood(dailyFoodInr("luxury", india)), india).food).toBe("luxury");
    expect(chooseSpending(forFood(dailyFoodInr("luxury", india)) - 1, india).food).toBe("upscale");
    expect(chooseSpending(forFood(dailyFoodInr("upscale", india)), india).food).toBe("upscale");
    expect(chooseSpending(forFood(dailyFoodInr("upscale", india)) - 1, india).food).toBe("mid");
    expect(chooseSpending(forFood(dailyFoodInr("mid", india)), india).food).toBe("mid");
    expect(chooseSpending(forFood(dailyFoodInr("mid", india)) - 1, india).food).toBe("budget");
  });

  it("still plans the cheapest meals when not even those fit, or the budget is already spent", () => {
    expect(chooseSpending(forFood(dailyFoodInr("budget", india)) - 1, india).food).toBe("budget");
    expect(chooseSpending(0, india).food).toBe("budget");
    expect(chooseSpending(-5_000, india).food).toBe("budget");
  });

  it("counts a cost exactly equal to the share as fitting", () => {
    // 5 x ₹200 x 0.2 is exactly ₹200 in floating point, so this is a true boundary.
    const money = 5 * p.budget;
    expect(money * NIGHTLIFE_SHARE_OF_SPENDING).toBe(p.budget);
    expect(chooseSpending(money, india).nightlife).toBe("budget");
  });

  it("gives a night out the dearest tier that fits its share, and none when nothing does", () => {
    expect(chooseSpending(forNightlife(p.luxury), india).nightlife).toBe("luxury");
    expect(chooseSpending(forNightlife(p.luxury) - 1, india).nightlife).toBe("upscale");
    expect(chooseSpending(forNightlife(p.mid), india).nightlife).toBe("mid");
    expect(chooseSpending(forNightlife(p.budget), india).nightlife).toBe("budget");
    expect(chooseSpending(forNightlife(p.budget) - 1, india).nightlife).toBeNull();
    expect(chooseSpending(-1, india).nightlife).toBeNull();
  });

  it("chooses cheaper for the same money in a dearer country", () => {
    const money = forFood(dailyFoodInr("upscale", india));
    expect(chooseSpending(money, india).food).toBe("upscale");
    expect(chooseSpending(money, spendPricesFor("CH")).food).toBe("budget");
  });
});
