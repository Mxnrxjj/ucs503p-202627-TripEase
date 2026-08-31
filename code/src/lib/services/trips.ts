import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/collections";
import { dayCountInclusive } from "@/lib/date";
import type { CapturedPlace, Trip } from "@/types/trip";

/**
 * The single place Firestore is touched for trip data. Components call these
 * functions; they never build queries themselves. Keeping data access here is
 * what makes the vendor-lock-in surface small enough to reason about.
 */

export interface CreateTripInput {
  title: string;
  destinationLabel: string;
  startDate: Date;
  endDate: Date;
  travellers: number;
  currency: string;
}

/**
 * A place captured without the maps provider (Iteration 1). It carries a
 * locally-minted id and no real coordinates; Iteration 3 replaces these with
 * Places-resolved records that have a stable provider id and a real lat/lng.
 */
export function makeLocalPlace(label: string): CapturedPlace {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 8);
  return { placeId: `local:${slug || "place"}-${rand}`, label, lat: 0, lng: 0 };
}

function tsToDate(value: unknown): Date {
  return value instanceof Timestamp ? value.toDate() : new Date(0);
}

const tripConverter: FirestoreDataConverter<Trip> = {
  toFirestore(trip): DocumentData {
    // Writes go through the explicit helpers below, which handle Date ->
    // Timestamp conversion and server timestamps. This path only strips the
    // synthetic `id` field for the rare caller that opts a write into the
    // converter.
    const data: Record<string, unknown> = { ...trip };
    delete data.id;
    return data;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot): Trip {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      ownerId: data.ownerId,
      title: data.title,
      destination: data.destination,
      startDate: tsToDate(data.startDate),
      endDate: tsToDate(data.endDate),
      dayCount: data.dayCount,
      travellers: data.travellers ?? 1,
      currency: data.currency ?? "INR",
      places: (data.places ?? []) as CapturedPlace[],
      budget: data.budget ?? {},
      totals: data.totals ?? { plannedTotal: 0, spentTotal: 0 },
      share: data.share ?? { enabled: false, token: null },
      createdAt: tsToDate(data.createdAt),
      updatedAt: tsToDate(data.updatedAt),
    };
  },
};

const tripsCollection = () =>
  collection(db, COLLECTIONS.trips).withConverter(tripConverter);
const tripDoc = (tripId: string) =>
  doc(db, COLLECTIONS.trips, tripId).withConverter(tripConverter);

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in.");
  return uid;
}

export async function createTrip(input: CreateTripInput): Promise<string> {
  const uid = requireUid();
  const ref = await addDoc(collection(db, COLLECTIONS.trips), {
    ownerId: uid,
    title: input.title.trim(),
    destination: makeLocalPlace(input.destinationLabel.trim()),
    startDate: Timestamp.fromDate(input.startDate),
    endDate: Timestamp.fromDate(input.endDate),
    dayCount: dayCountInclusive(input.startDate, input.endDate),
    travellers: input.travellers,
    currency: input.currency,
    places: [],
    budget: {},
    totals: { plannedTotal: 0, spentTotal: 0 },
    share: { enabled: false, token: null },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getTrip(tripId: string): Promise<Trip | null> {
  const snapshot = await getDoc(tripDoc(tripId));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function listTripsForOwner(uid: string): Promise<Trip[]> {
  const snapshot = await getDocs(
    query(
      tripsCollection(),
      where("ownerId", "==", uid),
      orderBy("createdAt", "desc"),
    ),
  );
  return snapshot.docs.map((d) => d.data());
}

/** Realtime list of the signed-in user's trips. Returns an unsubscribe fn. */
export function subscribeToOwnerTrips(
  uid: string,
  onData: (trips: Trip[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(
      tripsCollection(),
      where("ownerId", "==", uid),
      orderBy("createdAt", "desc"),
    ),
    (snapshot) => onData(snapshot.docs.map((d) => d.data())),
    (error) => onError?.(error),
  );
}

/** Realtime single trip. Returns an unsubscribe fn. */
export function subscribeToTrip(
  tripId: string,
  onData: (trip: Trip | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    tripDoc(tripId),
    (snapshot) => onData(snapshot.exists() ? snapshot.data() : null),
    (error) => onError?.(error),
  );
}

export function renameTrip(tripId: string, title: string): Promise<void> {
  return updateDoc(doc(db, COLLECTIONS.trips, tripId), {
    title: title.trim(),
    updatedAt: serverTimestamp(),
  });
}

export function updateTripSchedule(
  tripId: string,
  startDate: Date,
  endDate: Date,
): Promise<void> {
  return updateDoc(doc(db, COLLECTIONS.trips, tripId), {
    startDate: Timestamp.fromDate(startDate),
    endDate: Timestamp.fromDate(endDate),
    dayCount: dayCountInclusive(startDate, endDate),
    updatedAt: serverTimestamp(),
  });
}

export function deleteTrip(tripId: string): Promise<void> {
  return deleteDoc(doc(db, COLLECTIONS.trips, tripId));
}

export function addPlaceToTrip(
  tripId: string,
  place: CapturedPlace,
): Promise<void> {
  return updateDoc(doc(db, COLLECTIONS.trips, tripId), {
    places: arrayUnion(place),
    updatedAt: serverTimestamp(),
  });
}

export function removePlaceFromTrip(
  tripId: string,
  place: CapturedPlace,
): Promise<void> {
  return updateDoc(doc(db, COLLECTIONS.trips, tripId), {
    places: arrayRemove(place),
    updatedAt: serverTimestamp(),
  });
}
