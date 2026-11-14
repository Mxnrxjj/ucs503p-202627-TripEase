/**
 * Typical hotel prices, by city and by hotel class. This is the data behind
 * TripEase's hotel estimates; the rules that use it are in `./rates.ts`.
 *
 * Every amount is rupees for ONE standard room for ONE night, before local tax,
 * as a 3-star, 4-star and 5-star average. Researched 13-14 November 2026, from
 * the pages below. Dollar figures were converted at ₹94.20 (RBI reference rate,
 * 13 November 2026) and rounded to the nearest ₹100.
 *
 * Booking.com's averages differ between the language versions of the same
 * city page, sometimes by more than a quarter. Each row uses the default page
 * (or the one named in its comment), and a row whose versions or sources
 * disagree by more than 25% is marked "low". Booking.com does not say whether
 * its averages include tax; they are taken as before tax, like the rest.
 *
 * Two kinds of row:
 *  - A star-class row (`derived` false) reads all three classes off one city
 *    page (Booking.com and Skyscanner publish an average for each class).
 *  - A `derived` row had only one typical price for the city (a median or an
 *    average across hotels). That price is used as 4-star, and the other two
 *    classes come from it: 3-star at 0.6x and 5-star at 2.1x. Those ratios were
 *    the median within-city ratios across the 13 cities that had all three
 *    classes when the table was first made (across the 47 rows that have them
 *    now they are 0.62 and 2.01), so they are a model, not a reading. A row can
 *    also derive just some classes (`derivedTiers`): Maafushi's 5-star only.
 *
 * Nothing here is a live price. It does not move with the season, the day of
 * the week or how far ahead a room is booked, and the app says it is an
 * estimate wherever it is shown. A city that is not listed is priced from
 * its country's main city, scaled by the kind of place it is (`CITY_KINDS`
 * below), or from its region (see `./rates.ts`).
 */

import type { HotelTier } from "@/lib/hotels/rates";

export type RateSource =
  | "booking"
  | "skyscanner"
  | "kayak"
  | "budgetyourtrip"
  | "travelstatisticsbureau"
  | "stayapi"
  | "cheaphotels"
  | "worldstaytracker"
  | "safari-operators";

/** Where each source's figures come from, so a number can be checked. */
export const RATE_SOURCES: Record<RateSource, string> = {
  booking:
    "Booking.com city or region pages, average price by star class (booking.com/city/<cc>/<city>.html, booking.com/region/<cc>/<region>.html)",
  skyscanner: "Skyscanner city pages, average price by star class (skyscanner.co.in/hotels/...)",
  kayak: "KAYAK city pages, 'expect to pay' by star class (kayak.co.in/<City>-Hotels...)",
  budgetyourtrip: "BudgetYourTrip hotel pages, average by star class (budgetyourtrip.com/hotels/...)",
  travelstatisticsbureau: "Travel Statistics Bureau, average hotel price in Tokyo 2026 (travelstatisticsbureau.com)",
  stayapi: "StayAPI, median hotel price in 50 cities, 10 Nov 2026 (stayapi.com/blog/average-cost-hotel-room)",
  cheaphotels: "Cheaphotels.org Hotel Price Index 2025, central 3-star+ double (cheaphotels.org/press/cities-world-2025.html)",
  worldstaytracker: "WorldStayTracker, average of popular Booking.com 3-4 star hotels (worldstaytracker.com)",
  "safari-operators":
    "Masai Mara camp operators' published ranges, per person full board, doubled for a room (findmysafari.com, masaimarasafari.travel)",
};

export interface CityRates {
  city: string;
  /** Other names the same place goes by, or towns priced as part of it (Ubud is priced as Bali). */
  aliases: string[];
  /** Rupees per room per night, before local tax. */
  star3: number;
  star4: number;
  star5: number;
  /** True when any class was worked out from the city's 4-star price (see above). */
  derived: boolean;
  /** Which classes were worked out, and so are estimates, not readings. */
  derivedTiers: HotelTier[];
  sources: RateSource[];
  /** "medium": a star-class reading. "low": one price, a small sample, or sources that disagree. */
  confidence: "medium" | "low";
}

/** `derived`: true for 3-star and 5-star, false for none, or the classes that were. */
const r = (
  city: string,
  [star3, star4, star5]: [number, number, number],
  sources: RateSource[],
  confidence: CityRates["confidence"],
  derived: boolean | HotelTier[] = false,
  aliases: string[] = [],
): CityRates => {
  const derivedTiers: HotelTier[] = derived === true ? ["budget", "upscale"] : derived === false ? [] : derived;
  return { city, aliases, star3, star4, star5, derived: derivedTiers.length > 0, derivedTiers, sources, confidence };
};

/**
 * By ISO country code. The FIRST city of a country is the one its other
 * cities are priced from when they have no row of their own, so it is the
 * country's main city, not its cheapest or dearest.
 *
 * Masai Mara is a room in a safari camp with all meals, which is why it is so
 * much dearer than Nairobi. Maafushi is a local-island guesthouse, not a
 * resort; Malé is city hotels. Bhutan's prices are the room only: the
 * Sustainable Development Fee every visitor pays per night is not in them.
 * Croatia starts with Split, not Zagreb: Zagreb has no figures of its own,
 * and Split is the more ordinary of the two cities that do.
 */
export const HOTEL_RATES: Record<string, CityRates[]> = {
  IN: [
    r("Delhi", [2700, 3600, 15000], ["skyscanner"], "medium", false, ["New Delhi", "Delhi NCR"]),
    r("Jaipur", [2000, 4500, 9000], ["skyscanner"], "medium"),
    r("Agra", [2000, 4800, 7800], ["skyscanner", "kayak"], "medium"),
    r("Udaipur", [3700, 7100, 17500], ["skyscanner"], "low"),
    r("Mumbai", [3000, 5100, 10000], ["skyscanner"], "medium", false, ["Bombay"]),
    r("Goa", [3600, 6000, 12000], ["skyscanner", "booking"], "medium", false, ["Panaji", "North Goa", "South Goa"]),
    r("Varanasi", [3500, 4600, 7000], ["skyscanner", "booking"], "low", false, ["Benares", "Banaras"]),
    r("Rishikesh", [2800, 5200, 6100], ["skyscanner"], "medium"),
    r("Bengaluru", [2200, 4200, 9000], ["skyscanner"], "medium", false, ["Bangalore"]),
    r("Shimla", [2900, 4100, 10000], ["skyscanner"], "medium"),
  ],
  TH: [
    r("Bangkok", [4500, 5700, 12000], ["budgetyourtrip"], "medium"),
    r("Chiang Mai", [4100, 7700, 16100], ["booking"], "medium"),
    r("Phuket", [7200, 12100, 25300], ["stayapi"], "low", true),
  ],
  JP: [
    r("Tokyo", [9500, 15800, 31800], ["travelstatisticsbureau"], "medium"),
    r("Kyoto", [9800, 15700, 29400], ["booking"], "medium"),
    r("Osaka", [4900, 8100, 17000], ["stayapi"], "low", true),
  ],
  NP: [
    r("Kathmandu", [3200, 5200, 9500], ["booking", "skyscanner"], "low"),
  ],
  BT: [
    // Small samples (about 39 and 26 hotels); the language versions disagree.
    r("Thimphu", [4800, 6200, 30800], ["booking"], "low"),
    r("Paro", [4300, 19000, 66700], ["booking"], "low"),
  ],
  LK: [
    r("Colombo", [3700, 6600, 12100], ["booking", "skyscanner"], "medium"),
    r("Kandy", [5000, 6600, 10200], ["booking"], "low"),
    r("Ella", [7700, 13600, 29800], ["booking"], "medium"),
  ],
  KH: [
    r("Siem Reap", [2000, 3300, 11000], ["booking"], "medium"),
    r("Phnom Penh", [1800, 2900, 6100], ["cheaphotels"], "low", true),
  ],
  GE: [
    r("Tbilisi", [4900, 8400, 16900], ["booking"], "medium"),
  ],
  VN: [
    r("Hanoi", [3400, 5900, 12900], ["booking"], "medium"),
    r("Ho Chi Minh City", [3500, 5800, 12300], ["worldstaytracker"], "low", true, ["Saigon", "Ho Chi Minh"]),
    r("Hoi An", [3900, 6700, 15300], ["booking"], "low"),
  ],
  KR: [
    r("Seoul", [12200, 16600, 33300], ["booking"], "medium"),
    r("Busan", [6900, 10900, 23100], ["booking"], "medium", false, ["Pusan"]),
    r("Jeju", [6000, 9200, 22900], ["booking"], "low", false, ["Jeju City", "Jeju Island"]),
  ],
  AE: [
    r("Dubai", [7300, 10100, 28800], ["booking"], "medium"),
    r("Abu Dhabi", [5900, 9800, 20600], ["cheaphotels"], "low", true),
  ],
  OM: [
    r("Muscat", [4300, 7700, 31500], ["booking"], "medium"),
  ],
  JO: [
    r("Amman", [5100, 9400, 16700], ["booking"], "medium"),
  ],
  EG: [
    r("Cairo", [3900, 5600, 17800], ["booking"], "medium"),
  ],
  FR: [
    r("Paris", [13600, 20200, 38100], ["budgetyourtrip"], "medium"),
    r("Lyon", [8900, 14800, 31100], ["cheaphotels"], "low", true),
    r("Nice", [21200, 32100, 94300], ["booking"], "medium"),
  ],
  SG: [
    r("Singapore", [9000, 15000, 31500], ["stayapi"], "low", true),
  ],
  ID: [
    r("Bali", [5200, 8700, 18200], ["stayapi"], "low", true, ["Ubud", "Seminyak", "Uluwatu", "Kuta", "Canggu", "Denpasar"]),
  ],
  MV: [
    // 4-star: Booking.com's own 4-star page and Skyscanner are far apart
    // (Skyscanner's 3-star agrees).
    r("Malé", [15400, 25000, 62700], ["booking"], "low"),
    r("Maafushi", [5200, 12200, 25500], ["booking"], "low", ["upscale"]),
  ],
  MY: [
    r("Kuala Lumpur", [3600, 6000, 12700], ["stayapi"], "low", true, ["KL"]),
    r("Penang", [3000, 6500, 12700], ["skyscanner"], "low", false, ["George Town"]),
    // The whole island (Booking.com's region page; there is no city page).
    r("Langkawi", [7000, 10800, 30400], ["booking"], "low"),
  ],
  PH: [
    r("Manila", [2500, 4100, 8700], ["cheaphotels"], "low", true),
    r("El Nido", [8900, 17800, 25400], ["booking"], "low"),
    r("Cebu", [3800, 4700, 10200], ["booking"], "medium", false, ["Cebu City"]),
  ],
  TR: [
    r("Istanbul", [5700, 9400, 19800], ["stayapi"], "low", true),
    r("Antalya", [6100, 10200, 21400], ["stayapi"], "low", true),
  ],
  IT: [
    r("Rome", [10300, 17100, 36000], ["stayapi"], "low", true),
    r("Florence", [10300, 17100, 36000], ["cheaphotels"], "low", true),
    r("Venice", [9800, 16400, 34400], ["cheaphotels"], "low", true),
  ],
  ES: [
    r("Barcelona", [10300, 17200, 36200], ["stayapi"], "low", true),
    r("Madrid", [11100, 18600, 39000], ["cheaphotels"], "low", true),
    r("Seville", [15400, 21800, 40200], ["booking"], "medium", false, ["Sevilla"]),
  ],
  CH: [
    r("Zurich", [15500, 25800, 54200], ["cheaphotels"], "low", true),
    r("Lucerne", [28500, 43200, 94200], ["booking"], "medium", false, ["Luzern"]),
    // Booking.com's region page, which takes in the villages around the town.
    r("Interlaken", [31900, 54100, 104400], ["booking"], "low"),
    r("Zermatt", [28600, 40300, 57800], ["booking"], "low"),
  ],
  GB: [
    r("London", [14000, 23300, 48900], ["stayapi"], "low", true),
    r("Edinburgh", [11000, 18400, 38600], ["cheaphotels"], "low", true),
    r("Bath", [18000, 24900, 33100], ["booking"], "medium"),
  ],
  GR: [
    r("Athens", [7700, 12800, 26900], ["worldstaytracker", "cheaphotels"], "low", true),
  ],
  DE: [
    r("Berlin", [9900, 16600, 34800], ["worldstaytracker", "cheaphotels"], "low", true),
    r("Munich", [10400, 17300, 36400], ["cheaphotels"], "low", true, ["Munchen"]),
  ],
  NL: [
    r("Amsterdam", [6700, 11100, 23300], ["stayapi"], "low", true),
  ],
  PT: [
    r("Lisbon", [9900, 16600, 34800], ["worldstaytracker", "cheaphotels"], "low", true, ["Lisboa"]),
    r("Porto", [7100, 11800, 24700], ["cheaphotels"], "low", true),
  ],
  AT: [
    r("Vienna", [9800, 16400, 34400], ["stayapi"], "low", true),
    r("Salzburg", [19000, 28700, 89100], ["booking"], "low"),
    // 5-star from Booking.com's Innsbruck region page; the city page gives none.
    r("Innsbruck", [15600, 20700, 31400], ["booking"], "medium"),
  ],
  HR: [
    r("Split", [12700, 20300, 44800], ["booking"], "low"),
    r("Dubrovnik", [15000, 26300, 49600], ["booking"], "low"),
  ],
  CZ: [
    r("Prague", [5300, 8900, 18600], ["stayapi"], "low", true),
  ],
  IS: [
    r("Reykjavik", [9400, 15700, 33000], ["cheaphotels"], "low", true),
  ],
  NO: [
    r("Oslo", [8500, 14100, 29700], ["cheaphotels"], "low", true),
  ],
  MA: [
    r("Marrakech", [6300, 10500, 22000], ["worldstaytracker", "cheaphotels"], "low", true, ["Marrakesh"]),
  ],
  ZA: [
    r("Cape Town", [7600, 12700, 26700], ["worldstaytracker"], "low", true),
    r("Johannesburg", [5300, 8900, 18600], ["worldstaytracker", "cheaphotels"], "low", true),
  ],
  KE: [
    r("Nairobi", [4400, 7300, 15400], ["worldstaytracker"], "low", true),
    r("Masai Mara", [18800, 47100, 113000], ["safari-operators"], "low", false, ["Maasai Mara"]),
  ],
  US: [
    r("New York City", [21000, 35000, 73600], ["stayapi"], "low", true, ["New York", "NYC", "Manhattan"]),
    r("Los Angeles", [10000, 16700, 35000], ["stayapi"], "low", true),
    r("San Francisco", [8800, 14600, 30700], ["stayapi"], "low", true),
  ],
  CA: [
    r("Toronto", [10300, 17100, 36000], ["worldstaytracker", "cheaphotels"], "low", true),
    r("Vancouver", [9200, 15300, 32000], ["cheaphotels"], "low", true),
  ],
  MX: [
    r("Mexico City", [5700, 9400, 19800], ["worldstaytracker", "cheaphotels"], "low", true),
    r("Cancún", [4700, 7800, 16400], ["worldstaytracker", "cheaphotels"], "low", true),
  ],
  BR: [
    r("Rio de Janeiro", [5700, 9500, 20000], ["worldstaytracker", "cheaphotels"], "low", true),
    r("São Paulo", [4400, 7300, 15400], ["worldstaytracker", "cheaphotels"], "low", true),
  ],
  PE: [
    r("Lima", [3800, 6300, 13300], ["worldstaytracker", "cheaphotels"], "low", true),
    r("Cusco", [4000, 6700, 14000], ["worldstaytracker"], "low", true),
  ],
  AU: [
    r("Sydney", [8000, 13400, 28100], ["cheaphotels"], "low", true),
    r("Melbourne", [4900, 8200, 17200], ["cheaphotels"], "low", true),
  ],
  NZ: [
    r("Auckland", [7000, 11600, 24300], ["worldstaytracker"], "low", true),
  ],
};

/**
 * What kind of place each city is, other than its country's main city. Two
 * uses (see `./rates.ts`):
 *  - A city WITH a row pairs with its country's main city. For each kind, the
 *    median of those pairs' 4-star ratios says how dear that kind of place
 *    runs against its country's main city.
 *  - A city WITHOUT a row is its country's main city's prices times its kind's
 *    ratio, labelled as modelled.
 * Which kind a city is, is a judgement, made here so it can be changed:
 * "beach" for beach and island towns, "nature" for mountain, lake, desert and
 * national-park stays, "heritage" for old towns known for their sights, "city"
 * for other large cities.
 */
export type CityKind = "city" | "heritage" | "beach" | "nature";

export const CITY_KINDS: Record<string, Record<string, CityKind>> = {
  IN: {
    Jaipur: "heritage",
    Agra: "heritage",
    Udaipur: "heritage",
    Mumbai: "city",
    Goa: "beach",
    Varanasi: "heritage",
    Rishikesh: "nature",
    Bengaluru: "city",
    Shimla: "nature",
  },
  TH: { "Chiang Mai": "heritage", Phuket: "beach" },
  JP: { Kyoto: "heritage", Osaka: "city" },
  NP: { Pokhara: "nature" },
  BT: { Paro: "nature", Punakha: "nature" },
  LK: { Kandy: "heritage", Ella: "nature", Galle: "heritage" },
  KH: { "Phnom Penh": "city" },
  GE: { Kazbegi: "nature", Batumi: "beach" },
  VN: { "Ho Chi Minh City": "city", "Hoi An": "heritage" },
  KR: { Busan: "city", Jeju: "beach" },
  AE: { "Abu Dhabi": "city" },
  OM: { Nizwa: "heritage" },
  JO: { Petra: "heritage", "Wadi Rum": "nature" },
  EG: { Luxor: "heritage", Aswan: "heritage" },
  FR: { Lyon: "city", Nice: "beach" },
  MV: { Maafushi: "beach" },
  MY: { Penang: "city", Langkawi: "beach" },
  PH: { "El Nido": "beach", Cebu: "city" },
  TR: { Antalya: "beach", "Göreme": "heritage" },
  IT: { Florence: "heritage", Venice: "heritage" },
  ES: { Madrid: "city", Seville: "city" },
  CH: { Lucerne: "heritage", Interlaken: "nature", Zermatt: "nature" },
  GB: { Edinburgh: "city", Bath: "heritage" },
  GR: { Santorini: "beach", Mykonos: "beach" },
  DE: { Munich: "city", Cologne: "city" },
  NL: { Rotterdam: "city", "The Hague": "city" },
  PT: { Porto: "city", Lagos: "beach" },
  AT: { Salzburg: "heritage", Innsbruck: "nature" },
  HR: { Dubrovnik: "heritage", Zagreb: "city" },
  CZ: { "Český Krumlov": "heritage" },
  IS: { Vik: "nature", Akureyri: "city" },
  NO: { Bergen: "city", "Tromsø": "nature" },
  MA: { Fes: "heritage", Chefchaouen: "heritage" },
  ZA: { Johannesburg: "city", "Kruger National Park": "nature" },
  KE: { "Diani Beach": "beach" },
  US: { "Los Angeles": "city", "San Francisco": "city" },
  CA: { Vancouver: "city", Banff: "nature" },
  MX: { "Cancún": "beach", Oaxaca: "heritage" },
  BR: { "São Paulo": "city", Salvador: "city" },
  PE: { Cusco: "heritage", Arequipa: "heritage" },
  AU: { Melbourne: "city", Cairns: "beach" },
  NZ: { Queenstown: "nature", Rotorua: "nature" },
};

/**
 * Other spellings of the cities in `CITY_KINDS`, for names a model or a
 * traveller might type ("Fez" for Fes). Cities with a row of their own have
 * their aliases on the row.
 */
export const CITY_KIND_ALIASES: Record<string, Record<string, string[]>> = {
  MA: { Fes: ["Fez"], Chefchaouen: ["Chaouen"] },
  PE: { Cusco: ["Cuzco"] },
  ZA: { "Kruger National Park": ["Kruger", "Kruger Park"] },
  JO: { Petra: ["Wadi Musa"] },
  GR: { Santorini: ["Thira", "Fira", "Oia"] },
  DE: { Cologne: ["Köln"] },
  NL: { "The Hague": ["Den Haag"] },
  IS: { Vik: ["Vik i Myrdal"] },
  MX: { Oaxaca: ["Oaxaca City"] },
  BR: { Salvador: ["Salvador da Bahia"] },
  CZ: { "Český Krumlov": ["Krumlov"] },
};
