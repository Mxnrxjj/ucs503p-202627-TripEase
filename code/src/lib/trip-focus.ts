import { COUNTRIES, normalise, resolveCountry } from "@/lib/countries";

/**
 * The part of a country a trip is about: "Goa" in India, "Kyoto" in Japan,
 * "Tuscany" in Italy.
 *
 * A trip's `destination` stays the country, because flights, hotel rates,
 * photos and Travis are all worked out per country. The focus is optional and
 * only steers which cities the trip is planned around. It is the traveller's
 * own text, checked for shape here; whether the place really exists, and
 * really is in that country, is settled by the place search when the trip is
 * built (see `searchPlaces` in the itinerary generator).
 */

export const FOCUS_MAX_LENGTH = 60;

/** Letters in any script, digits, spaces, and the punctuation place names use. */
const FOCUS_CHARACTERS = /^[\p{L}\p{M}\p{N} .,'’()&-]+$/u;

/**
 * What's wrong with a focus the traveller typed, or null if it's fine. Empty
 * is fine: the focus is optional.
 */
export function focusProblem(text: string): string | null {
  const focus = text.trim();
  if (focus === "") return null;
  if (focus.length < 2) return "Type at least 2 letters, or leave this empty.";
  if (focus.length > FOCUS_MAX_LENGTH) return `Keep it under ${FOCUS_MAX_LENGTH} characters.`;
  if (!FOCUS_CHARACTERS.test(focus) || !/\p{L}/u.test(focus)) {
    return "Use a place name: letters, spaces and . , ' - ( ) & only.";
  }
  return null;
}

/**
 * Other words for the country itself, or for a theme rather than a place, that
 * the picker accepts as aliases. Typing one of them picks the country but is
 * not a place to plan around: "thai" is not somewhere in Thailand.
 */
const NOT_A_PLACE = new Set(
  [
    "thai", "uae", "emirates", "singapura", "maldive", "atoll", "ceylon", "nippon", "bharat",
    "korea", "k-pop", "turkiye", "türkiye", "greek", "swiss", "alps", "dutch", "holland", "tulips",
    "czech", "czech republic", "uk", "britain", "great britain", "usa", "america",
    "united states of america", "kiwi", "aussie", "northern lights", "aurora", "safari", "inca", "kl",
    "caucasus", "himalaya", "adriatic", "rockies", "fjords", "ring road", "golden circle", "amazon",
    "sahara", "nile", "pyramids",
  ].map(normalise),
);

/** Exposed for tests, so a typo in the list above can't go unnoticed. */
export const NOT_A_PLACE_ALIASES: ReadonlySet<string> = NOT_A_PLACE;

/** "chiang mai" → "Chiang Mai", "mont saint-michel" → "Mont Saint-Michel". */
function titleCase(text: string): string {
  return text.replace(/(^|[\s-])(\p{L})/gu, (_, separator: string, letter: string) => separator + letter.toUpperCase());
}

/**
 * The place a traveller meant when they typed it into the country picker and
 * then chose `countryName`: "goa", then India, means Goa. Only a whole alias of
 * that country counts, and never one that is just another name for the country
 * or a theme. Null otherwise.
 */
export function placeFromQuery(typed: string, countryName: string): string | null {
  const country = COUNTRIES.find((c) => c.name === countryName);
  const query = normalise(typed);
  if (!country || !query || NOT_A_PLACE.has(query)) return null;
  const alias = country.aliases.find((a) => normalise(a) === query);
  return alias ? titleCase(alias) : null;
}

/**
 * The focus a trip is actually planned around: tidied, and null when there
 * isn't a usable one. A focus that is only the country again ("India", or
 * "Bharat" for India) is no focus at all.
 */
export function cleanFocus(focus: string | null | undefined, destination: string): string | null {
  if (typeof focus !== "string") return null;
  const tidy = focus.trim().replace(/\s+/g, " ");
  if (tidy === "" || focusProblem(tidy) !== null) return null;

  // A name in a script `normalise` doesn't keep ("東京") has an empty key: it
  // can't be the country's English name, so it is kept as typed.
  const key = normalise(tidy);
  if (!key) return tidy;
  if (key === normalise(destination)) return null;
  const country = resolveCountry(destination);
  if (!country) return tidy;
  const isCountryAgain =
    key === normalise(country.name) || (NOT_A_PLACE.has(key) && country.aliases.some((a) => normalise(a) === key));
  return isCountryAgain ? null : tidy;
}

/** "Goa, India", or just "India" when the trip has no focus. */
export function destinationLabel(destination: string, focus: string | null | undefined): string {
  const place = cleanFocus(focus, destination);
  return place ? `${place}, ${destination}` : destination;
}

/**
 * The focus to keep after the country picker reports a change.
 *
 * `focusFor` is the country the current focus was written for. While the
 * traveller is still typing in the picker nothing is chosen (`picked` is
 * empty) and the focus is left alone. Picking a country right after typing one
 * of its places ("goa", then India) makes that place the focus. Otherwise a
 * focus survives only if the country is the one it was written for: "Goa" means
 * nothing in Thailand.
 */
export function focusAfterPick(focus: string, focusFor: string, picked: string, typed?: string): string {
  if (!picked) return focus;
  const place = typed ? placeFromQuery(typed, picked) : null;
  if (place) return place;
  return picked === focusFor ? focus : "";
}
