"use client";

import dynamic from "next/dynamic";
import { MapPinOff } from "lucide-react";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  buildMapPoints,
  countUnmappablePlaces,
  filterMapPoints,
  routeForDay,
  type MapFilter,
} from "@/lib/services/map-points";
import type { Trip } from "@/types/trip";

/**
 * Everything the map needs that isn't Leaflet itself: filter controls,
 * loading/empty states, and the "which points are visible" logic.
 *
 * The Leaflet layer is loaded with `ssr: false` because it touches `window`
 * on import. Points come from the live trip via `buildMapPoints`, never from
 * a separate hardcoded dataset, so the map always reflects the itinerary the
 * traveller is actually looking at — including their edits.
 */
const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
      <span className="text-sm text-zinc-500">Loading map…</span>
    </div>
  ),
});

export function TripMap({
  trip,
  filter,
  onFilterChange,
  selectedId,
  onSelect,
  className,
}: {
  trip: Trip;
  filter: MapFilter;
  onFilterChange: (filter: MapFilter) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
}) {
  const allPoints = useMemo(() => buildMapPoints(trip), [trip]);
  const points = useMemo(() => filterMapPoints(allPoints, filter), [allPoints, filter]);
  const route = useMemo(
    () => (filter.mode === "day" ? routeForDay(points, filter.dayId) : []),
    [points, filter],
  );
  const unmappable = useMemo(() => countUnmappablePlaces(trip), [trip]);

  const activeCity = trip.cities.find((c) => c.id === filter.cityId) ?? null;
  const activeDay = trip.days.find((d) => d.id === filter.dayId) ?? null;

  // A selection that's been filtered out would leave a highlighted row with
  // no marker (and vice versa) — drop it instead of showing a phantom.
  useEffect(() => {
    if (selectedId && !points.some((p) => p.id === selectedId)) {
      onSelect(null);
    }
  }, [points, selectedId, onSelect]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Map filter">
        <FilterButton
          active={filter.mode === "all"}
          onClick={() => onFilterChange({ ...filter, mode: "all" })}
        >
          Whole trip
        </FilterButton>
        {activeCity ? (
          <FilterButton
            active={filter.mode === "city"}
            onClick={() => onFilterChange({ ...filter, mode: "city" })}
          >
            {activeCity.name}
          </FilterButton>
        ) : null}
        {activeDay ? (
          <FilterButton
            active={filter.mode === "day"}
            onClick={() => onFilterChange({ ...filter, mode: "day" })}
          >
            Day {activeDay.dayNumber}
          </FilterButton>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        {points.length === 0 ? (
          <EmptyMap hasAnyPoints={allPoints.length > 0} />
        ) : (
          <LeafletMap
            points={points}
            routePoints={route}
            selectedId={selectedId}
            onSelect={onSelect}
            fitKey={`${filter.mode}:${filter.cityId ?? ""}:${filter.dayId ?? ""}`}
          />
        )}
      </div>

      <p className="text-xs text-zinc-500">
        {filter.mode === "day" && route.length > 1 ? (
          <>Dashed line shows the order you planned this day — not a driving route. </>
        ) : null}
        {unmappable > 0 ? (
          <>
            {unmappable} {unmappable === 1 ? "place has" : "places have"} no location data yet, so
            {unmappable === 1 ? " it isn't" : " they aren't"} on the map.
          </>
        ) : null}
      </p>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600",
        active
          ? "bg-orange-600 text-white"
          : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
      )}
    >
      {children}
    </button>
  );
}

function EmptyMap({ hasAnyPoints }: { hasAnyPoints: boolean }) {
  return (
    <div className="flex h-full min-h-64 w-full flex-col items-center justify-center gap-2 bg-zinc-50 p-6 text-center dark:bg-zinc-900">
      <MapPinOff className="h-6 w-6 text-zinc-400" />
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Nothing to map here yet</p>
      <p className="max-w-xs text-xs text-zinc-500">
        {hasAnyPoints
          ? "None of the places in this view have location data. Try the whole-trip filter."
          : "This trip's places don't have coordinates yet. Places from a live provider include them automatically."}
      </p>
    </div>
  );
}
