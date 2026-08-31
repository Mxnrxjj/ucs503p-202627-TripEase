"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, Button, Card, TextField } from "@/components/ui";
import {
  dayCountInclusive,
  parseDateInput,
  toDateInputValue,
} from "@/lib/date";
import {
  addPlaceToTrip,
  makeLocalPlace,
  removePlaceFromTrip,
  renameTrip,
  subscribeToTrip,
  updateTripSchedule,
} from "@/lib/services/trips";
import type { CapturedPlace, Trip } from "@/types/trip";

export default function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = use(params);
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToTrip(
      tripId,
      (next) => {
        setTrip(next);
        setLoadError(null);
      },
      (err) => setLoadError(err.message),
    );
  }, [tripId]);

  if (loadError) {
    return <Alert>Couldn&apos;t load this trip: {loadError}</Alert>;
  }
  if (trip === undefined) {
    return <p className="text-sm text-zinc-500">Loading trip…</p>;
  }
  if (trip === null) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-500">
          This trip doesn&apos;t exist, or it isn&apos;t yours.
        </p>
        <Link href="/dashboard" className="text-sm text-sky-700 hover:underline">
          ← Back to your trips
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard" className="text-sm text-sky-700 hover:underline">
        ← Back to your trips
      </Link>

      <TripHeader trip={trip} />
      <ScheduleEditor trip={trip} />
      <PlacesSection trip={trip} />
    </div>
  );
}

function TripHeader({ trip }: { trip: Trip }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(trip.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("The name can't be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await renameTrip(trip.id, title);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col gap-3">
        <TextField
          id="rename"
          label="Trip name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setTitle(trip.title);
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{trip.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {trip.destination.label} · {trip.dayCount} day
          {trip.dayCount === 1 ? "" : "s"} · {trip.travellers} traveller
          {trip.travellers === 1 ? "" : "s"} · {trip.currency}
        </p>
      </div>
      <Button variant="secondary" onClick={() => setEditing(true)}>
        Edit name
      </Button>
    </div>
  );
}

function ScheduleEditor({ trip }: { trip: Trip }) {
  const [start, setStart] = useState(toDateInputValue(trip.startDate));
  const [end, setEnd] = useState(toDateInputValue(trip.endDate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const days =
    start && end
      ? dayCountInclusive(parseDateInput(start), parseDateInput(end))
      : 0;
  const dirty =
    start !== toDateInputValue(trip.startDate) ||
    end !== toDateInputValue(trip.endDate);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (days < 1) {
      setError("The end date must be on or after the start date.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateTripSchedule(
        trip.id,
        parseDateInput(start),
        parseDateInput(end),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold">Dates</h2>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="schedule-start"
            label="Start date"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <TextField
            id="schedule-end"
            label="End date"
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <p className="text-xs text-zinc-500">
          {days > 0 ? `${days} day${days === 1 ? "" : "s"}.` : "Invalid range."}
        </p>
        {error ? <Alert>{error}</Alert> : null}
        {saved ? <Alert tone="info">Dates updated.</Alert> : null}
        <div>
          <Button type="submit" disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save dates"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PlacesSection({ trip }: { trip: Trip }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    if (
      trip.places.some(
        (p) => p.label.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      setError("That place is already on the trip.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addPlaceToTrip(trip.id, makeLocalPlace(trimmed));
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the place.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(place: CapturedPlace) {
    try {
      await removePlaceFromTrip(trip.id, place);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the place.");
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-base font-semibold">Places</h2>
      <p className="mb-4 text-xs text-zinc-500">
        Add the places you want to visit. Assigning them to days and drawing the
        route comes in a later iteration.
      </p>

      {trip.places.length === 0 ? (
        <p className="text-sm text-zinc-500">No places added yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {trip.places.map((place) => (
            <li
              key={place.placeId}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span>{place.label}</span>
              <Button
                variant="ghost"
                onClick={() => remove(place)}
                aria-label={`Remove ${place.label}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <TextField
            id="add-place"
            label="Add a place"
            placeholder="Amber Fort"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add"}
        </Button>
      </form>

      {error ? (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
    </Card>
  );
}
