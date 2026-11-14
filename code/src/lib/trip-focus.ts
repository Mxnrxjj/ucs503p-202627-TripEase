import { COUNTRIES, normalise, resolveCountry, type Country } from "@/lib/countries";

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

// `isFocus` in firestore.rules repeats these three for writes made around the
// app, and a test keeps them equal: change one and that test names the other.
export const FOCUS_MIN_LENGTH = 2;
export const FOCUS_MAX_LENGTH = 60;

/** Letters in any script, digits, spaces, and the punctuation place names use. */
export const FOCUS_CHARACTERS = /^[\p{L}\p{M}\p{N} .,'’()&-]+$/u;

/**
 * What's wrong with a focus the traveller typed, or null if it's fine. Empty
 * is fine: the focus is optional.
 */
export function focusProblem(text: string): string | null {
  const focus = text.trim();
  if (focus === "") return null;
  if (focus.length < FOCUS_MIN_LENGTH) return `Type at least ${FOCUS_MIN_LENGTH} letters, or leave this empty.`;
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
 * "Goa, India" → "Goa": a place with its own country tacked on, as people and
 * models often write it. Only the country's name, or a nickname for it that
 * isn't a place, counts: in "Mumbai, Goa" the last word is a place, so it stays.
 */
function withoutTrailingCountry(text: string, country: Country): string {
  const comma = text.lastIndexOf(",");
  if (comma < 0) return text;
  const tail = normalise(text.slice(comma + 1));
  if (!tail) return text;
  const names = [country.name, ...country.aliases].map(normalise);
  const isCountry = tail === names[0] || names.slice(1).some((alias) => alias === tail && NOT_A_PLACE.has(alias));
  return isCountry ? text.slice(0, comma) : text;
}

/**
 * The focus a trip is actually planned around: tidied, and null when there
 * isn't a usable one. A focus that is only the country again ("India", or
 * "Bharat" for India) is no focus at all, and one that ends with its country
 * ("Goa, India") is the place alone.
 */
export function cleanFocus(focus: string | null | undefined, destination: string): string | null {
  if (typeof focus !== "string") return null;
  const tidy = focus.trim().replace(/\s+/g, " ");
  if (tidy === "" || focusProblem(tidy) !== null) return null;

  // A name in a script `normalise` doesn't keep ("東京") has an empty key: it
  // can't be the country's English name, so it is kept as typed. The same goes
  // for a name that only partly is ("東京, Japan"), where `normalise` would
  // leave just "japan" and make a place look like the country.
  const key = normalise(tidy);
  if (!key) return tidy;
  const otherScript = /(?!\p{Script=Latin})\p{L}/u.test(tidy);
  if (!otherScript && key === normalise(destination)) return null;
  const country = resolveCountry(destination);
  if (!country) return tidy;
  const isCountryAgain =
    key === normalise(country.name) || (NOT_A_PLACE.has(key) && country.aliases.some((a) => normalise(a) === key));
  if (!otherScript && isCountryAgain) return null;

  const place = withoutTrailingCountry(tidy, country);
  return place === tidy ? tidy : cleanFocus(place, destination);
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
