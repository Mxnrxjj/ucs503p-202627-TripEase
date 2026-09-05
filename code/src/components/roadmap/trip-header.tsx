"use client";

import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { formatDateShort, formatMoney } from "@/lib/utils";
import { renameTrip } from "@/lib/services/trips";
import type { Trip } from "@/types/trip";

export function TripHeader({ trip }: { trip: Trip }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(trip.title);
  const [busy, setBusy] = useState(false);

  const percent = trip.budget.total > 0 ? Math.round((trip.budget.estimatedTotal / trip.budget.total) * 100) : 0;
  const nights = Math.max(0, trip.dayCount - 1);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await renameTrip(trip.id, title);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {editing ? (
        <form onSubmit={save} className="flex items-center gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className="max-w-sm" />
          <Button type="submit" size="sm" disabled={busy}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl font-medium tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            {trip.title}
          </h1>
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit trip name"
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      )}

      <p className="text-sm text-zinc-500">
        {formatDateShort(trip.startDate)} — {formatDateShort(trip.endDate)} · {nights} nights ·{" "}
        {trip.cities.length} {trip.cities.length === 1 ? "city" : "cities"}
      </p>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {formatMoney(trip.budget.estimatedTotal, trip.currency)} / {formatMoney(trip.budget.total, trip.currency)}
          </span>
          <span className="text-zinc-500">{percent}%</span>
        </div>
        <div className="h-2.5 w-full max-w-md overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all duration-700 ${percent > 100 ? "bg-red-500" : "bg-orange-600"}`}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
