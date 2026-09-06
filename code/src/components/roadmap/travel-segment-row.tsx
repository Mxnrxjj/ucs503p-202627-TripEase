"use client";

import { Car, Footprints, Plane, Train, TramFront, Route } from "lucide-react";
import { formatDurationShort, formatMoney } from "@/lib/utils";
import type { TravelMode, TravelSegment } from "@/types/travel";

/**
 * A leg of travel, rendered deliberately unlike an activity: no card, no
 * category emoji, muted and inset on a connecting line. A traveller should
 * never mistake "getting to Phuket" for "a thing to do in Phuket".
 *
 * Every duration here is a heuristic estimate, and every one says so.
 */
const MODE_ICON: Record<TravelMode, typeof Car> = {
  walk: Footprints,
  car: Car,
  transit: TramFront,
  train: Train,
  flight: Plane,
  unknown: Route,
};

const MODE_LABEL: Record<TravelMode, string> = {
  walk: "Walk",
  car: "Drive",
  transit: "Transit",
  train: "Train",
  flight: "Flight",
  unknown: "Travel",
};

export function TravelSegmentRow({ segment }: { segment: TravelSegment }) {
  const Icon = MODE_ICON[segment.mode];
  const isTransfer = segment.type === "city-transfer";

  const details = [
    formatDurationShort(segment.estimatedDurationMinutes),
    segment.distanceKm !== null ? `${Math.round(segment.distanceKm)} km` : null,
    segment.estimatedCost && segment.currency
      ? `${formatMoney(segment.estimatedCost, segment.currency)} est.`
      : null,
  ].filter(Boolean);

  if (isTransfer) {
    return (
      <li className="my-1 flex items-center gap-3 rounded-xl border border-dashed border-orange-300 bg-orange-50/60 px-3 py-2.5 dark:border-orange-900 dark:bg-orange-950/20">
        <Icon className="h-4 w-4 shrink-0 text-orange-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {segment.fromCity} → {segment.toCity}
          </p>
          <p className="text-xs text-zinc-500">
            {MODE_LABEL[segment.mode]} · {details.join(" · ")} · estimated
          </p>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 py-0.5 pl-[4.75rem] text-xs text-zinc-400">
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span>
        {MODE_LABEL[segment.mode]} {details.join(" · ")} (est.)
      </span>
    </li>
  );
}
