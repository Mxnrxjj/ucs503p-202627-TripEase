// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/server/firebase-auth";
import { getPlacesProvider } from "@/lib/services/places";
import { PlacesProviderError } from "@/lib/services/places/errors";
import { ratedPlace, RatedPlacesProvider } from "@/test-support/places/rated-provider";
import { POST } from "./route";

vi.mock("@/lib/server/firebase-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/firebase-auth")>();
  return { ...actual, requireUser: vi.fn() };
});
vi.mock("@/lib/services/places", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/places")>();
  return { ...actual, getPlacesProvider: vi.fn() };
});

const mockedUser = vi.mocked(requireUser);
const mockedProvider = vi.mocked(getPlacesProvider);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockedUser.mockResolvedValue({ uid: "u1", email: null });
});

const body = (cityName: string) => ({
  draft: {
    destination: "India",
    startDate: "2027-03-01",
    endDate: "2027-03-04",
    budget: 150_000,
    currency: "INR",
    travelers: 2,
    travelerType: "couple",
    preferences: ["culture"],
  },
  cities: [{ name: cityName, days: 4, reason: "Chosen by the traveller" }],
  existing: { cities: [], days: [] },
});

const post = (payload: unknown) =>
  POST(new NextRequest("http://localhost/api/trips/rebuild", { method: "POST", body: JSON.stringify(payload) }));

describe("rebuilding a trip with an edited city list", () => {
  it("names a city that can't be found in the trip's country", async () => {
    mockedProvider.mockReturnValue(
      new RatedPlacesProvider({ hotel: [ratedPlace("Paris Hotel", 4.8, 9_000, { countryCode: "FR" })], attraction: [ratedPlace("Sight", 4.5, 900)] }),
    );
    const response = await post(body("Paris"));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe(
      "No hotels could be found in Paris. Check that it's spelled right and is in India, or try a bigger town nearby.",
    );
  });

  it("keeps other place-search failures in its own words", async () => {
    mockedProvider.mockImplementation(() => {
      throw new PlacesProviderError("quota-exceeded", "upstream said: key AIza-secret");
    });
    const response = await post(body("Goa"));
    const json = await response.json();
    expect(response.status).toBe(503);
    expect(json.error).toMatch(/usage limit/);
    expect(JSON.stringify(json)).not.toMatch(/AIza|upstream/);
  });
});
