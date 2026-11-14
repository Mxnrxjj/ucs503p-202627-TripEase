import { describe, expect, it } from "vitest";
import { MockAIProvider } from "@/test-support/ai/mock-provider";
import { planCities } from "@/lib/services/planning";
import type { AIProvider } from "@/lib/services/ai";
import type { CityPlanRequest } from "@/types/planning";

/**
 * The end-to-end planning pipeline with an injected provider:
 * proposal → Zod → constraint checks → one repair → fallback.
 */
function request(overrides: Partial<CityPlanRequest> = {}): CityPlanRequest {
  return {
    destination: "Thailand",
    startDate: "2027-06-12",
    endDate: "2027-06-20",
    dayCount: 9,
    travelers: 2,
    budget: 150_000,
    currency: "INR",
    preferences: ["culture", "food"],
    ...overrides,
  };
}

describe("planCities pipeline", () => {
  it("falls back deterministically when no provider is configured", async () => {
    const plan = await planCities(request(), null);
    expect(plan.source).toBe("fallback");
    // Thailand's real cities, from the country list: nothing is invented.
    expect(plan.cities.map((c) => c.name)).toEqual(["Bangkok", "Phuket", "Chiang Mai"]);
    expect(plan.cities.reduce((sum, c) => sum + c.days, 0)).toBe(9);
  });

  it("accepts a valid proposal in a single call", async () => {
    const provider = new MockAIProvider("valid");
    const plan = await planCities(request(), provider);
    expect(provider.calls).toBe(1);
    expect(plan.source).toBe("ai");
    expect(plan.cities.reduce((sum, c) => sum + c.days, 0)).toBe(9);
  });

  it("repairs an invalid allocation with exactly one retry", async () => {
    const provider = new MockAIProvider("bad-allocation");
    const plan = await planCities(request(), provider);
    expect(provider.calls).toBe(2);
    expect(plan.cities.reduce((sum, c) => sum + c.days, 0)).toBe(9);
  });

  it("does not retry a quota failure", async () => {
    const provider = new MockAIProvider("error");
    const plan = await planCities(request(), provider);
    // Retrying a quota error just spends money twice.
    expect(provider.calls).toBe(1);
    expect(plan.source).toBe("fallback");
    expect(plan.fallbackReason).toContain("quota");
  });

  it("retries a malformed response once, then falls back", async () => {
    const provider = new MockAIProvider("malformed");
    const plan = await planCities(request(), provider);
    expect(provider.calls).toBe(2);
    expect(plan.source).toBe("fallback");
    expect(plan.cities.reduce((sum, c) => sum + c.days, 0)).toBe(9);
  });

  it("always returns an allocation matching the trip length", async () => {
    for (const behaviour of ["valid", "bad-allocation", "malformed", "error"] as const) {
      for (const dayCount of [1, 4, 9, 15]) {
        const plan = await planCities(request({ dayCount }), new MockAIProvider(behaviour));
        expect(plan.cities.reduce((sum, c) => sum + c.days, 0)).toBe(dayCount);
      }
    }
  });

  it("plans a supported country across its real cities when there is no model", async () => {
    const plan = await planCities(request({ destination: "Italy" }), null);
    expect(plan.source).toBe("fallback");
    expect(plan.cities.map((c) => c.name)).toEqual(["Rome", "Florence", "Venice"]);
    expect(plan.cities.reduce((sum, c) => sum + c.days, 0)).toBe(9);
  });

  it("keeps places it has no list for honest", async () => {
    const plan = await planCities(request({ destination: "Narnia" }), null);
    expect(plan.cities).toEqual([expect.objectContaining({ name: "Narnia", days: 9 })]);
  });
});

describe("a trip about one place in the country", () => {
  /** A model that always answers with this plan, counting its calls. */
  function answering(destination: string, cities: { name: string; days: number }[]) {
    const seen: CityPlanRequest[] = [];
    const provider = {
      name: "groq",
      model: "stub",
      async planCities(req: CityPlanRequest) {
        seen.push(req);
        return { destination, cities: cities.map((c) => ({ ...c, reason: "stub" })) };
      },
    } as unknown as AIProvider;
    return { provider, seen };
  }

  it("is given the place, and the model's plan for it is used", async () => {
    const { provider, seen } = answering("India", [
      { name: "Panaji", days: 5 },
      { name: "Palolem", days: 4 },
    ]);
    const plan = await planCities(request({ destination: "India", focus: "Goa" }), provider);
    expect(seen[0].focus).toBe("Goa");
    expect(plan.source).toBe("ai");
    expect(plan.cities.map((c) => c.name)).toEqual(["Panaji", "Palolem"]);
  });

  it("accepts a model that names the place rather than the country", async () => {
    for (const named of ["Goa", "Goa, India", "goa"]) {
      const { provider, seen } = answering(named, [{ name: "Goa", days: 9 }]);
      const plan = await planCities(request({ destination: "India", focus: "Goa" }), provider);
      expect(plan.source, named).toBe("ai");
      expect(seen).toHaveLength(1);
    }
  });

  it("still rejects a plan for somewhere else entirely", async () => {
    const { provider, seen } = answering("Thailand", [{ name: "Phuket", days: 9 }]);
    const plan = await planCities(request({ destination: "India", focus: "Goa" }), provider);
    expect(seen).toHaveLength(2);
    expect(plan.source).toBe("fallback");
    expect(plan.cities).toEqual([expect.objectContaining({ name: "Goa", days: 9 })]);
  });

  it("rejects a plan for another country even when the place's name is part of it", async () => {
    const { provider, seen } = answering("Thailand", [{ name: "Phuket", days: 9 }]);
    const plan = await planCities(request({ destination: "India", focus: "Tha" }), provider);
    expect(seen).toHaveLength(2);
    expect(plan.source).toBe("fallback");
  });

  it("accepts a plan that names a place the country list puts in this country", async () => {
    const { provider } = answering("Kerala", [{ name: "Kochi", days: 9 }]);
    expect((await planCities(request({ destination: "India", focus: "Kerala" }), provider)).source).toBe("ai");
  });

  it("accepts a plan that names a place the country list doesn't know", async () => {
    const { provider } = answering("Darjeeling", [{ name: "Darjeeling", days: 9 }]);
    expect((await planCities(request({ destination: "India", focus: "Darjeeling" }), provider)).source).toBe("ai");
  });

  it("does not second-guess the country of a trip whose destination it doesn't know", async () => {
    const { provider } = answering("Narnia, Thailand", [{ name: "Cair Paravel", days: 9 }]);
    expect((await planCities(request({ destination: "Narnia" }), provider)).source).toBe("ai");
  });

  it("still accepts a plan for an older trip saved as free text", async () => {
    const { provider } = answering("Bali", [{ name: "Ubud", days: 9 }]);
    expect((await planCities(request({ destination: "Bali, Indonesia" }), provider)).source).toBe("ai");
  });

  it("does not accept a model that names a place when none was asked for", async () => {
    const { provider } = answering("Goa", [{ name: "Goa", days: 9 }]);
    const plan = await planCities(request({ destination: "India" }), provider);
    expect(plan.source).toBe("fallback");
  });

  it("with no model, bases the whole trip in the place asked for", async () => {
    const plan = await planCities(request({ destination: "India", focus: "Darjeeling", dayCount: 6 }), null);
    expect(plan.source).toBe("fallback");
    expect(plan.cities).toEqual([{ name: "Darjeeling", days: 6, reason: "The place you asked for" }]);
  });
});
