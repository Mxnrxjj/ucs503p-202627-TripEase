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
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

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
async function seedTrip(tripId = "trip-1", ownerId = OWNER) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "trips", tripId), {
      ownerId,
      title: "Seed trip",
      dayCount: 3,
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
