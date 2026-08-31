"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { Alert, Button, Card, TextField } from "@/components/ui";
import { dayCountInclusive, parseDateInput, toDateInputValue } from "@/lib/date";
import {
  createTrip,
  deleteTrip,
  subscribeToOwnerTrips,
} from "@/lib/services/trips";
import type { Trip } from "@/types/trip";

const CURRENCIES = ["INR", "USD", "EUR", "GBP"] as const;

function defaultDates() {
  const start = new Date();
  start.setDate(start.getDate() + 14);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToOwnerTrips(
      user.uid,
      (next) => {
        setTrips(next);
        setLoadError(null);
      },
      (err) => setLoadError(err.message),
    );
  }, [user]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your trips</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Each trip is one shared record holding its itinerary, route and budget.
        </p>
      </div>

      <CreateTripForm />

      {loadError ? <Alert>Couldn&apos;t load your trips: {loadError}</Alert> : null}

      {trips === null ? (
        <p className="text-sm text-zinc-500">Loading trips…</p>
      ) : trips.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No trips yet. Create your first one above.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {trips.map((trip) => (
            <li key={trip.id}>
              <TripCard trip={trip} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateTripForm() {
  const initial = useMemo(() => defaultDates(), []);
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [travellers, setTravellers] = useState("4");
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("INR");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return dayCountInclusive(parseDateInput(startDate), parseDateInput(endDate));
  }, [startDate, endDate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim() || !destination.trim()) {
      setError("Give the trip a name and a destination.");
      return;
    }
    if (days < 1) {
      setError("The end date must be on or after the start date.");
      return;
    }

    setBusy(true);
    try {
      await createTrip({
        title,
        destinationLabel: destination,
        startDate: parseDateInput(startDate),
        endDate: parseDateInput(endDate),
        travellers: Math.max(1, Number(travellers) || 1),
        currency,
      });
      setTitle("");
      setDestination("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the trip.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold">New trip</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="trip-title"
            label="Trip name"
            placeholder="Jaipur long weekend"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextField
            id="trip-destination"
            label="Destination"
            placeholder="Jaipur"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
          <TextField
            id="trip-start"
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <TextField
            id="trip-end"
            label="End date"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <TextField
            id="trip-travellers"
            label="Travellers"
            type="number"
            min={1}
            value={travellers}
            onChange={(e) => setTravellers(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="trip-currency"
              className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
            >
              Currency
            </label>
            <select
              id="trip-currency"
              value={currency}
              onChange={(e) =>
                setCurrency(e.target.value as (typeof CURRENCIES)[number])
              }
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus-visible:border-sky-600 focus-visible:ring-2 focus-visible:ring-sky-600/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-zinc-500">
          {days > 0
            ? `${days} day${days === 1 ? "" : "s"}.`
            : "Pick a valid date range."}
        </p>

        {error ? <Alert>{error}</Alert> : null}

        <div>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create trip"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = `${trip.startDate.toLocaleDateString()} – ${trip.endDate.toLocaleDateString()}`;

  async function handleDelete() {
    if (!window.confirm(`Delete "${trip.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteTrip(trip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
      setDeleting(false);
    }
  }

  return (
    <Card className="flex h-full flex-col justify-between gap-4">
      <div>
        <Link
          href={`/trips/${trip.id}`}
          className="text-base font-semibold hover:underline"
        >
          {trip.title}
        </Link>
        <p className="mt-1 text-sm text-zinc-500">{trip.destination.label}</p>
        <p className="mt-2 text-xs text-zinc-500">
          {range} · {trip.dayCount} day{trip.dayCount === 1 ? "" : "s"} ·{" "}
          {trip.travellers} traveller{trip.travellers === 1 ? "" : "s"}
        </p>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <div className="flex gap-2">
        <Link href={`/trips/${trip.id}`}>
          <Button variant="secondary">Open</Button>
        </Link>
        <Button variant="danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </Card>
  );
}
