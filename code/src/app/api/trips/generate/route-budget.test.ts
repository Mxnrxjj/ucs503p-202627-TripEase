// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/server/firebase-auth";
import { getAIProvider, AIProviderError, type AIProvider } from "@/lib/services/ai";
import { checkTripBudget } from "@/lib/services/budget-check";
import { getPlacesProvider } from "@/lib/services/places";
import { spendPricesFor } from "@/lib/spending/prices";
import { ratedPlace, RatedPlacesProvider } from "@/test-support/places/rated-provider";
import { POST } from "./route";

/**
 * The generate route's budget check: a trip whose budget is below even its
 * cheapest version gets a short model-written note, and nothing else does.
 */

vi.mock("@/lib/server/firebase-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/firebase-auth")>();
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("@/lib/services/places", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/places")>();
  return { ...actual, getPlacesProvider: vi.fn() };
});
// The real check, unless a test says otherwise.
vi.mock("@/lib/services/budget-check", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/budget-check")>();
  return { ...actual, checkTripBudget: vi.fn(actual.checkTripBudget) };
});
vi.mock("@/lib/services/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/ai")>();
  return { ...actual, getAIProvider: vi.fn() };
});

const NOTE = "Flights and hotels for four people already take more than this budget, so fewer days or a higher budget would make it work.";

let userCounter = 0;
const explainBudget = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  explainBudget.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  userCounter += 1;
  vi.mocked(requireUser).mockResolvedValue({ uid: `budget-user-${userCounter}`, email: null });
  const cheap = spendPricesFor("IN").perPersonInr.budget;
  vi.mocked(getPlacesProvider).mockReturnValue(
    new RatedPlacesProvider({
      hotel: [ratedPlace("Lake Hotel", 4.6, 2_000)],
      attraction: Array.from({ length: 12 }, (_, i) => ratedPlace(`Sight ${i}`, 4.3, 1_000 + i)),
      restaurant: Array.from({ length: 8 }, (_, i) =>
        ratedPlace(`Dhaba ${i}`, 4.3, 900, { category: "food", price: { amount: cheap, currency: "INR", isEstimate: true } }),
      ),
      nightlife: [],
    }),
  );
  vi.mocked(getAIProvider).mockReturnValue({
    name: "test",
    model: "test",
    planCities: () => Promise.reject(new AIProviderError("auth", "not used")),
    converse: vi.fn(),
    proposeTripEdit: vi.fn(),
    explainBudget,
  } as unknown as AIProvider);
});

const trip = (budget: number) => ({
  destination: "India",
  startDate: "2027-03-01",
  endDate: "2027-03-08",
  budget,
  currency: "INR",
  travelers: 4,
  travelerType: "friends",
  preferences: [],
  includeFlights: true,
  origin: "DEL",
  plan: {
    destination: "India",
    cities: [
      { name: "Jaipur", days: 4, reason: "t" },
      { name: "Udaipur", days: 4, reason: "t" },
    ],
    source: "ai",
    plannerVersion: "test",
    fallbackReason: null,
  },
});

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/trips/generate", { method: "POST", body: JSON.stringify(body) }));

describe("the budget note", () => {
  it("is written for a budget below the trip's cheapest version, with the figures it describes", async () => {
    explainBudget.mockResolvedValue({ note: NOTE });
    const response = await post(trip(20_000));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(explainBudget).toHaveBeenCalledTimes(1);
    const asked = explainBudget.mock.calls[0][0];
    expect(asked.budget).toBe(20_000);
    expect(asked.minimumBudget).toBeGreaterThan(20_000);
    expect(asked.cities).toEqual(["Jaipur", "Udaipur"]);
    expect(body.itinerary.budgetNote).toEqual({ text: NOTE, minimumBudget: asked.minimumBudget, budget: 20_000, currency: "INR" });
  });

  it("is not asked for when the budget is enough", async () => {
    const response = await post(trip(5_000_000));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(explainBudget).not.toHaveBeenCalled();
    expect(body.itinerary.budgetNote).toBeNull();
  });

  it("is not asked for when the plan is only over a budget that could cover it", async () => {
    vi.mocked(checkTripBudget).mockReturnValueOnce({
      verdict: "over",
      minimum: { currency: "INR", budget: 15_000, parts: { flights: 0, hotels: 0, food: 0, transport: 0 } },
    });
    const response = await post(trip(20_000));
    expect(response.status).toBe(200);
    expect(explainBudget).not.toHaveBeenCalled();
    expect((await response.json()).itinerary.budgetNote).toBeNull();
  });

  it("is simply left out when the model fails: the trip is still built", async () => {
    explainBudget.mockRejectedValue(new AIProviderError("quota", "busy"));
    const response = await post(trip(20_000));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.itinerary.days.length).toBe(8);
    expect(body.itinerary.budgetNote).toBeNull();
  });

  it("is left out when no model is configured", async () => {
    vi.mocked(getAIProvider).mockReturnValue(null);
    const response = await post(trip(20_000));
    expect((await response.json()).itinerary.budgetNote).toBeNull();
  });
});
