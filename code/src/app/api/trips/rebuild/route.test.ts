// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/server/firebase-auth";
import { RATE_LIMITS, waitInWords } from "@/lib/server/rate-limit";
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

// A new person for every test: the route's rate limiter remembers people for the whole file.
let userCounter = 0;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  userCounter += 1;
  mockedUser.mockResolvedValue({ uid: `user-${userCounter}`, email: null });
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

const goodResults = () =>
  new RatedPlacesProvider({
    hotel: [ratedPlace("Fine Hotel", 4.6, 4_000)],
    attraction: Array.from({ length: 12 }, (_, i) => ratedPlace(`Sight ${i}`, 4.0 + i / 20, 1_000 + i * 500)),
    restaurant: Array.from({ length: 9 }, (_, i) => ratedPlace(`Restaurant ${i}`, 4.0 + i / 20, 900)),
    nightlife: [],
  });

describe("rate limiting", () => {
  const { limit } = RATE_LIMITS.tripRebuild;
  /** Uses up this test's person's allowance with real requests that work. */
  async function useAllowance() {
    for (let i = 0; i < limit; i++) expect((await post(body("Goa"))).status).toBe(200);
  }

  it(`rebuilds a trip ${limit} times for one person, then refuses and says when to try again`, async () => {
    mockedProvider.mockReturnValue(goodResults());
    await useAllowance();

    const refused = await post(body("Goa"));
    const json = await refused.json();
    expect(refused.status).toBe(429);
    expect(json.code).toBe("rate-limited");
    expect(json.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.headers.get("Retry-After")).toBe(String(json.retryAfterSeconds));
    expect(json.error).toBe(`You've changed your cities several times in a short time. Try again ${waitInWords(json.retryAfterSeconds)}.`);
  });

  it("spends nothing on a request it refuses", async () => {
    const provider = goodResults();
    mockedProvider.mockReturnValue(provider);
    await useAllowance();
    const before = provider.searches.length;

    expect((await post(body("Goa"))).status).toBe(429);
    expect(provider.searches.length).toBe(before);
  });

  it("refuses before reading the request, so even a broken one counts as refused", async () => {
    mockedProvider.mockReturnValue(goodResults());
    await useAllowance();
    const broken = await POST(new NextRequest("http://localhost/api/trips/rebuild", { method: "POST", body: "not json" }));
    expect(broken.status).toBe(429);
  });

  it("limits one person without affecting anyone else", async () => {
    mockedProvider.mockReturnValue(goodResults());
    await useAllowance();
    expect((await post(body("Goa"))).status).toBe(429);

    mockedUser.mockResolvedValue({ uid: `someone-else-${userCounter}`, email: null });
    expect((await post(body("Goa"))).status).toBe(200);
  });
});
