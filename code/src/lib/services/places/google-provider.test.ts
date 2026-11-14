import { afterEach, describe, expect, it, vi } from "vitest";
import { GooglePlacesProvider } from "@/lib/services/places/google-provider";

// Every test uses its own destination, since searches are cached by query.
function stubGoogle(places: unknown[]) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ places }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).textQuery;
}

const raw = (name: string, priceLevel?: string) => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  displayName: { text: name },
  ...(priceLevel ? { priceLevel } : {}),
});

afterEach(() => vi.unstubAllGlobals());

describe("GooglePlacesProvider hotel search", () => {
  const provider = new GooglePlacesProvider("test-key");

  it("asks for the class of hotel it is given", async () => {
    const query = stubGoogle([raw("Some Hotel")]);
    await provider.searchPlaces({ destination: "Classville", country: "France", type: "hotel", hotelClass: 4 });
    expect(query()).toBe("4 star hotels in Classville, France");
  });

  it("puts the class in front of a search phrase too, for a hotel only", async () => {
    const query = stubGoogle([raw("Some Hotel")]);
    await provider.searchPlaces({ destination: "Phraseville", country: "France", type: "hotel", query: "well-rated hotel", hotelClass: 3 });
    expect(query()).toBe("3 star well-rated hotel in Phraseville, France");
    const other = stubGoogle([raw("Some Place")]);
    await provider.searchPlaces({ destination: "Otherville", country: "France", type: "attraction", query: "old town", hotelClass: 3 });
    expect(other()).toBe("old town in Otherville, France");
    const plain = stubGoogle([raw("Some Hotel")]);
    await provider.searchPlaces({ destination: "Namedville", country: "France", type: "hotel", query: "Hotel Lutetia" });
    expect(plain()).toBe("Hotel Lutetia in Namedville, France");
  });

  it("asks for any hotel when no class is given", async () => {
    const query = stubGoogle([raw("Some Hotel")]);
    await provider.searchPlaces({ destination: "Anyville", country: "France", type: "hotel" });
    expect(query()).toBe("hotels in Anyville, France");
  });

  it("caches each class separately, so a 3-star search doesn't answer a 5-star one", async () => {
    stubGoogle([raw("Some Hotel")]);
    await provider.searchPlaces({ destination: "Cacheville", type: "hotel", hotelClass: 3 });
    const query = stubGoogle([raw("Some Hotel")]);
    await provider.searchPlaces({ destination: "Cacheville", type: "hotel", hotelClass: 5 });
    expect(query()).toBe("5 star hotels in Cacheville");
  });

  it("gives a hotel no price, even when Google has a price level for it", async () => {
    stubGoogle([raw("Pricey Hotel", "PRICE_LEVEL_EXPENSIVE")]);
    const [hotel] = await provider.searchPlaces({ destination: "Priceville", type: "hotel" });
    expect(hotel.price).toBeNull();
  });

  it("still prices a restaurant from its price level", async () => {
    stubGoogle([raw("Pricey Restaurant", "PRICE_LEVEL_EXPENSIVE")]);
    const [restaurant] = await provider.searchPlaces({ destination: "Dineville", type: "restaurant" });
    expect(restaurant.price).toEqual({ amount: 3_500, currency: "INR", isEstimate: true });
  });
});
