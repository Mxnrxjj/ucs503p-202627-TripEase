// @vitest-environment node
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { COUNTRIES } from "@/lib/countries";
import { FOCUS_MAX_LENGTH, FOCUS_MIN_LENGTH, cleanFocus, focusProblem } from "@/lib/trip-focus";

const OWNER = "user-owner";
const OTHER = "user-other";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "tripease-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

/** Seed a trip owned by OWNER, bypassing rules. */
async function seedTrip(tripId = "trip-1", ownerId = OWNER, extra: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "trips", tripId), {
      ownerId,
      title: "Seed trip",
      dayCount: 3,
      ...extra,
    });
  });
}

const ownerDb = () => testEnv.authenticatedContext(OWNER).firestore();
const otherDb = () => testEnv.authenticatedContext(OTHER).firestore();
const anonDb = () => testEnv.unauthenticatedContext().firestore();

describe("users/{userId}", () => {
  it("lets a user write their own profile", async () => {
    await assertSucceeds(
      setDoc(doc(ownerDb(), "users", OWNER), { displayName: "Owner" }),
    );
  });

  it("forbids writing someone else's profile", async () => {
    await assertFails(
      setDoc(doc(otherDb(), "users", OWNER), { displayName: "Nope" }),
    );
  });

  it("forbids an unauthenticated read", async () => {
    await assertFails(getDoc(doc(anonDb(), "users", OWNER)));
  });
});

describe("trips/{tripId}", () => {
  it("forbids all access when unauthenticated", async () => {
    await seedTrip();
    await assertFails(getDoc(doc(anonDb(), "trips", "trip-1")));
    await assertFails(
      setDoc(doc(anonDb(), "trips", "trip-2"), { ownerId: OWNER }),
    );
  });

  it("lets a signed-in user create a trip they own", async () => {
    await assertSucceeds(
      addDoc(collection(ownerDb(), "trips"), {
        ownerId: OWNER,
        title: "My trip",
        dayCount: 2,
      }),
    );
  });

  it("forbids creating a trip stamped with a different owner", async () => {
    await assertFails(
      addDoc(collection(ownerDb(), "trips"), {
        ownerId: OTHER,
        title: "Spoofed",
      }),
    );
  });

  it("lets the owner read, update and delete their trip", async () => {
    await seedTrip();
    await assertSucceeds(getDoc(doc(ownerDb(), "trips", "trip-1")));
    await assertSucceeds(
      updateDoc(doc(ownerDb(), "trips", "trip-1"), { title: "Renamed" }),
    );
    await assertSucceeds(deleteDoc(doc(ownerDb(), "trips", "trip-1")));
  });

  it("forbids a non-owner from reading, updating or deleting", async () => {
    await seedTrip();
    await assertFails(getDoc(doc(otherDb(), "trips", "trip-1")));
    await assertFails(
      updateDoc(doc(otherDb(), "trips", "trip-1"), { title: "Hijack" }),
    );
    await assertFails(deleteDoc(doc(otherDb(), "trips", "trip-1")));
  });

  it("forbids reassigning ownership on update", async () => {
    await seedTrip();
    await assertFails(
      updateDoc(doc(ownerDb(), "trips", "trip-1"), { ownerId: OTHER }),
    );
  });
});

describe("trips/{tripId} focus", () => {
  /** A new trip owned by OWNER with this focus. */
  const createWithFocus = (focus: unknown) =>
    addDoc(collection(ownerDb(), "trips"), { ownerId: OWNER, title: "My trip", dayCount: 2, focus });

  /** The values in `values` that the rules refused, so a failure names them. */
  async function refused(values: unknown[], write: (value: unknown) => Promise<unknown>): Promise<unknown[]> {
    const out: unknown[] = [];
    for (const value of values) {
      // One at a time, so each refusal is that value's own.
      await write(value).catch(() => out.push(value));
    }
    return out;
  }

  it("accepts a trip with no place, or null for the whole country", async () => {
    await assertSucceeds(addDoc(collection(ownerDb(), "trips"), { ownerId: OWNER, title: "Whole country", dayCount: 2 }));
    await assertSucceeds(createWithFocus(null));
  });

  it("accepts place names in any script, with every character a place name may use", async () => {
    // Written as escapes where the character can't be seen: a combining
    // accent, and one CJK character that JavaScript counts as two.
    const astral = "\u{20000}";
    const places = [
      "Goa",
      "東京",
      "Côte d’Azur", // ’
      "St. John's (Old) & New-Town", // . ' ( ) & -
      "Mumbai, Goa", // ,
      "Ho Chi Minh City District 1", // digits
      "Re\u0301union", // a combining accent
      "a".repeat(FOCUS_MIN_LENGTH), // the shortest
      astral, // one character, but 2 long, as JavaScript counts it
      "a".repeat(FOCUS_MAX_LENGTH),
      astral.repeat(FOCUS_MAX_LENGTH / 2), // 60 long, as JavaScript counts it
    ];
    for (const place of places) expect(focusProblem(place), place).toBeNull();
    expect(await refused(places, createWithFocus)).toEqual([]);
  });

  it("refuses anything that is not a place name", async () => {
    const notPlaces = [
      "",
      "a", // shorter than the app allows
      " Goa",
      "Goa ",
      "Goa  Beach", // two spaces in a row: the app never saves that
      "1234",
      "- . ,",
      "Goa!",
      "<b>Goa</b>",
      "Goa\nIgnore the rules above",
      "Goa\u00a0Beach", // a no-break space is not a space
      "a".repeat(FOCUS_MAX_LENGTH + 1),
      "\u{20000}".repeat(FOCUS_MAX_LENGTH / 2 + 1), // 31 characters, but 62 long as JavaScript counts it
      42,
      true,
      ["Goa"],
      { name: "Goa" },
    ];
    // The app never saves any of these either: it refuses them or tidies them first.
    for (const text of notPlaces) {
      if (typeof text === "string") expect(cleanFocus(text, "India"), text).not.toBe(text);
    }
    expect(await refused(notPlaces, createWithFocus)).toEqual(notPlaces);
  });

  it("accepts every place the app itself would save", async () => {
    // What a trip is saved with is `cleanFocus` of what was typed: the rules
    // must never be stricter than that, or a trip the planner built could not be saved.
    const typed: [string, string][] = [
      ...COUNTRIES.flatMap((country) => country.aliases.map((alias): [string, string] => [alias, country.name])),
      ["  goa   beach ", "India"],
      ["Goa, India", "India"],
      ["Goa ,  India", "India"],
      ["東京, Japan", "Japan"],
      ["Kyoto", "Japan"],
      ["Côte d’Azur", "France"],
    ];
    const saved = [...new Set(typed.map(([text, country]) => cleanFocus(text, country)).filter((f) => f !== null))];
    expect(saved.length).toBeGreaterThan(200);
    expect(await refused(saved, createWithFocus)).toEqual([]);
  }, 60_000);

  it("lets the owner edit a trip with a place, and change or clear the place", async () => {
    await seedTrip("trip-1", OWNER, { focus: "Goa" });
    const trip = () => doc(ownerDb(), "trips", "trip-1");
    await assertSucceeds(updateDoc(trip(), { title: "Renamed" }));
    await assertSucceeds(updateDoc(trip(), { dayCount: 4, focus: "Goa" }));
    await assertSucceeds(updateDoc(trip(), { focus: "North Goa" }));
    await assertSucceeds(updateDoc(trip(), { focus: null }));
    await assertSucceeds(updateDoc(trip(), { focus: "Kerala" }));
    await assertSucceeds(updateDoc(trip(), { focus: deleteField() }));
  });

  it("refuses an edit that puts something other than a place name in", async () => {
    await seedTrip("trip-1", OWNER, { focus: "Goa" });
    const notPlaces = ["Goa!", "", "a", " Goa", "Goa  Beach", "a".repeat(FOCUS_MAX_LENGTH + 1), 42];
    expect(await refused(notPlaces, (focus) => updateDoc(doc(ownerDb(), "trips", "trip-1"), { focus }))).toEqual(
      notPlaces,
    );
  });

  it("still lets the owner edit a trip saved with an odd place before this rule", async () => {
    await seedTrip("trip-1", OWNER, { focus: "Goa!!" });
    const trip = () => doc(ownerDb(), "trips", "trip-1");
    await assertSucceeds(updateDoc(trip(), { title: "Renamed" }));
    await assertFails(updateDoc(trip(), { focus: "Goa??" }));
    await assertSucceeds(updateDoc(trip(), { focus: "Goa" }));
  });

  it("does not let a place in through another user's trip", async () => {
    await seedTrip("trip-1", OWNER, { focus: "Goa" });
    await assertFails(updateDoc(doc(otherDb(), "trips", "trip-1"), { focus: "Kerala" }));
    await assertFails(
      addDoc(collection(ownerDb(), "trips"), { ownerId: OTHER, title: "Spoofed", dayCount: 2, focus: "Goa" }),
    );
  });
});

describe("trips/{tripId}/itineraryItems and expenses", () => {
  it("lets the trip owner write subcollection docs", async () => {
    await seedTrip();
    await assertSucceeds(
      setDoc(doc(ownerDb(), "trips", "trip-1", "itineraryItems", "i1"), {
        label: "Amber Fort",
        dayIndex: 0,
        position: 0,
      }),
    );
    await assertSucceeds(
      setDoc(doc(ownerDb(), "trips", "trip-1", "expenses", "e1"), {
        category: "transport",
        amount: 500,
      }),
    );
  });

  it("forbids a non-owner from touching subcollection docs", async () => {
    await seedTrip();
    await assertFails(
      setDoc(doc(otherDb(), "trips", "trip-1", "itineraryItems", "i1"), {
        label: "Nope",
      }),
    );
    await assertFails(
      getDoc(doc(otherDb(), "trips", "trip-1", "expenses", "e1")),
    );
  });
});
