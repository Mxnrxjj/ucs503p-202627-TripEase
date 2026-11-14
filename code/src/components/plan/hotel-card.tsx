"use client";

import { BedDouble, Pencil, Star } from "lucide-react";
import { useState } from "react";
import { cn, formatMoney } from "@/lib/utils";
import type { City } from "@/types/itinerary";
import { HotelEditorDialog } from "@/components/roadmap/hotel-editor-dialog";
import { hotelCost, roomsFor } from "@/lib/services/budget-engine";
import { describeRateBasis } from "@/lib/hotels/rates";

/**
 * Where a city's nights are spent, as one tappable card that opens the hotel
 * editor. Used on the day view (so the stay is never more than a glance away)
 * and on the Stays tab. The element id is what the map scrolls to when a hotel
 * marker is selected.
 */
export function HotelCard({
  city,
  currency,
  travelers,
  selected = false,
  onEdit,
  className,
}: {
  city: City;
  currency: string;
  /** The party size: the room price is paid for every room it needs. */
  travelers: number;
  /** The map has this hotel selected. */
  selected?: boolean;
  onEdit: (patch: Partial<City["hotel"]>) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const total = hotelCost(city.hotel, travelers);
  const nights = city.hotel.nights;
  const rooms = roomsFor(travelers);

  // The trip ends the day it reaches this city, so there is nothing to book. The
  // id stays so a map click on this city's hotel still has somewhere to scroll.
  if (nights === 0) {
    return (
      <p id={`hotel-${city.id}`} className={cn("scroll-mt-24 text-xs text-zinc-500", className)}>
        No overnight stay in {city.name}.
      </p>
    );
  }

  return (
    <>
      <button
        id={`hotel-${city.id}`}
        onClick={() => setEditing(true)}
        className={cn(
          "group flex scroll-mt-24 items-center gap-3 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-left transition-colors hover:border-orange-300 hover:bg-orange-50 dark:border-zinc-800 dark:hover:bg-zinc-800",
          selected && "border-orange-300 bg-orange-50/70 dark:border-orange-800 dark:bg-orange-950/30",
          className,
        )}
      >
        <BedDouble className="h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            <span className="truncate">{city.hotel.name}</span>
            {city.hotel.rating ? (
              <span className="inline-flex items-center gap-0.5 text-xs font-normal text-zinc-500">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                {city.hotel.rating.value.toFixed(1)}
              </span>
            ) : null}
            <Pencil className="h-3 w-3 shrink-0 text-zinc-400 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
          </span>
          <span className="text-xs text-zinc-500">
            {formatMoney(city.hotel.pricePerNight, currency)}/{rooms > 1 ? "room/night" : "night"}
            {city.hotel.priceIsEstimate !== false ? " (est.)" : ""}
            {rooms > 1 ? ` · ${rooms} rooms` : ""} · {nights} {nights === 1 ? "night" : "nights"} · {formatMoney(total, currency)}
            {city.hotel.isDemoData ? " · not verified" : ""}
          </span>
          {city.hotel.rateBasis && city.hotel.priceIsEstimate !== false ? (
            <span className="block text-xs text-zinc-400">{describeRateBasis(city.hotel.rateBasis)}</span>
          ) : null}
        </span>
        <span className="sr-only">Edit hotel in {city.name}</span>
      </button>

      <HotelEditorDialog open={editing} onOpenChange={setEditing} hotel={city.hotel} maxNights={city.dayCount} onSave={onEdit} />
    </>
  );
}
