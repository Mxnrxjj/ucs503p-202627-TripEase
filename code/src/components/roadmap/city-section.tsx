"use client";

import { motion } from "framer-motion";
import { BedDouble, ChevronDown, Pencil, Star } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui";
import { cn, formatDateShort, formatMoney } from "@/lib/utils";
import type { Activity, City, TripDay } from "@/types/itinerary";
import { DayView } from "./day-view";
import { HotelEditorDialog } from "./hotel-editor-dialog";

export function CitySection({
  city,
  days,
  currency,
  expandedDayId,
  selectedPlaceId,
  onSelectPlace,
  onToggleDay,
  onEditHotel,
  onAddActivity,
  onEditActivity,
  onDeleteActivity,
  onReorderActivities,
}: {
  city: City;
  days: TripDay[];
  currency: string;
  expandedDayId: string | null;
  selectedPlaceId?: string | null;
  onSelectPlace?: (id: string | null) => void;
  onToggleDay: (dayId: string) => void;
  onEditHotel: (patch: Partial<City["hotel"]>) => void;
  onAddActivity: (dayId: string, activity: Activity) => void;
  onEditActivity: (dayId: string, activityId: string, patch: Partial<Activity>) => void;
  onDeleteActivity: (dayId: string, activityId: string) => void;
  onReorderActivities: (dayId: string, orderedIds: string[]) => void;
}) {
  const [editingHotel, setEditingHotel] = useState(false);
  const hotelTotal = city.hotel.pricePerNight * city.hotel.nights;

  return (
    <section id={`city-${city.id}`} className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <h2 className="font-display text-2xl font-medium tracking-tight text-zinc-900 dark:text-zinc-50">
            {city.name}
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            {formatDateShort(city.startDate)} — {formatDateShort(city.endDate)} · {city.dayCount} day
            {city.dayCount === 1 ? "" : "s"}
          </p>
        </div>

        <button
          id={`hotel-${city.id}`}
          onClick={() => setEditingHotel(true)}
          className={cn(
            "group flex scroll-mt-24 items-center gap-3 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-left transition-colors hover:border-orange-300 hover:bg-orange-50 dark:border-zinc-800 dark:hover:bg-zinc-800",
            selectedPlaceId === `hotel:${city.id}` &&
              "border-orange-300 bg-orange-50/70 dark:border-orange-800 dark:bg-orange-950/30",
          )}
        >
          <BedDouble className="h-4 w-4 shrink-0 text-orange-600" />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {city.hotel.name}
              {city.hotel.rating ? (
                <span className="inline-flex items-center gap-0.5 text-xs font-normal text-zinc-500">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {city.hotel.rating.value.toFixed(1)}
                </span>
              ) : null}
              <Pencil className="h-3 w-3 text-zinc-400 opacity-0 group-hover:opacity-100" />
            </span>
            <span className="text-xs text-zinc-500">
              {formatMoney(city.hotel.pricePerNight, currency)}/night
              {city.hotel.priceIsEstimate !== false ? " (est.)" : ""} · {city.hotel.nights} nights ·{" "}
              {formatMoney(hotelTotal, currency)}
              {city.hotel.isDemoData ? " · demo" : ""}
            </span>
          </span>
        </button>
      </div>

      <div className="relative mt-6 flex flex-col gap-2 pl-2">
        <div aria-hidden className="absolute bottom-4 left-[11px] top-4 w-px bg-zinc-200 dark:bg-zinc-800" />
        {days.map((day) => {
          const expanded = expandedDayId === day.id;
          const dayTotal = day.activities.reduce((s, a) => s + a.estimatedCost, 0);
          return (
            <div key={day.id} className="relative pl-8">
              <button
                onClick={() => onToggleDay(day.id)}
                className="flex w-full items-center gap-3 rounded-xl py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                aria-expanded={expanded}
              >
                <span
                  className={cn(
                    "absolute left-0 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                    expanded
                      ? "border-orange-600 bg-orange-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900",
                  )}
                >
                  {day.dayNumber}
                </span>
                <span className="flex-1">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">Day {day.dayNumber}</span>
                  <span className="ml-2 text-sm text-zinc-500">{formatDateShort(day.date)}</span>
                </span>
                {dayTotal > 0 ? (
                  <Badge tone="neutral">{formatMoney(dayTotal, currency)}</Badge>
                ) : null}
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", expanded && "rotate-180")}
                />
              </button>

              {expanded ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="pb-3 pt-1">
                    <DayView
                      day={day}
                      cityName={city.name}
                      cityCountry={city.country}
                      currency={currency}
                      selectedPlaceId={selectedPlaceId}
                      onSelectPlace={onSelectPlace}
                      onAddActivity={(a) => onAddActivity(day.id, a)}
                      onEditActivity={(id, patch) => onEditActivity(day.id, id, patch)}
                      onDeleteActivity={(id) => onDeleteActivity(day.id, id)}
                      onReorder={(ids) => onReorderActivities(day.id, ids)}
                    />
                  </div>
                </motion.div>
              ) : null}
            </div>
          );
        })}
      </div>

      <HotelEditorDialog
        open={editingHotel}
        onOpenChange={setEditingHotel}
        hotel={city.hotel}
        onSave={onEditHotel}
      />
    </section>
  );
}
