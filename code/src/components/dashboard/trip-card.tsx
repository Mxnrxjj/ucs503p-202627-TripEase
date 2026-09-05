"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Calendar, Trash2, Users } from "lucide-react";
import { Alert, Badge, Button } from "@/components/ui";
import { deleteTrip } from "@/lib/services/trips";
import { formatDateShort, formatMoney } from "@/lib/utils";
import type { Trip } from "@/types/trip";

const DESTINATION_EMOJI: Record<string, string> = {
  thailand: "🇹🇭",
};

function emojiFor(destination: string) {
  return DESTINATION_EMOJI[destination.trim().toLowerCase()] ?? "🌍";
}

export function TripCard({ trip }: { trip: Trip }) {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plannedActivities = trip.days.reduce((sum, d) => sum + d.activities.length, 0);
  const percentPlanned = plannedActivities > 0 ? 100 : 0;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteTrip(trip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this trip.");
      setDeleting(false);
    }
  }

  return (
    <div className="group flex h-full flex-col justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-lg hover:shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900">
      <Link href={`/trips/${trip.id}`} className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-2xl">{emojiFor(trip.destination)}</span>
            <h3 className="mt-1 text-base font-semibold text-zinc-900 group-hover:text-orange-700 dark:text-zinc-50 dark:group-hover:text-orange-400">
              {trip.title}
            </h3>
          </div>
          <Badge tone="orange">{trip.dayCount}d</Badge>
        </div>

        <div className="flex flex-col gap-1.5 text-sm text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {formatDateShort(trip.startDate)} → {formatDateShort(trip.endDate)}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {trip.travelers} traveller{trip.travelers === 1 ? "" : "s"} ·{" "}
            {formatMoney(trip.budget?.total ?? 0, trip.currency)}
          </span>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
            <span>{percentPlanned}% planned</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-orange-500" style={{ width: `${percentPlanned}%` }} />
          </div>
        </div>
      </Link>

      {error ? <Alert>{error}</Alert> : null}

      <div className="flex items-center justify-between">
        <Link
          href={`/trips/${trip.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:underline dark:text-orange-400"
        >
          Open trip <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {confirming ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Confirm"}
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${trip.title}`}
            className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
