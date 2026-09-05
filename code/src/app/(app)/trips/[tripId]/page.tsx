"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Map as MapIcon } from "lucide-react";
import { Alert, Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { CitySection } from "@/components/roadmap/city-section";
import { TripHeader } from "@/components/roadmap/trip-header";
import { BudgetPanel } from "@/components/budget/budget-panel";
import { TripMap } from "@/components/maps/trip-map";
import { buildSavingsSuggestions } from "@/lib/services/budget-engine";
import { subscribeToTrip, updateTripItinerary } from "@/lib/services/trips";
import {
  addActivity,
  applySuggestion,
  deleteActivity,
  reorderActivities,
  updateActivity,
  updateHotel,
} from "@/lib/services/trip-mutations";
import type { MapFilter, MapFilterMode } from "@/lib/services/map-points";
import { cn } from "@/lib/utils";
import type { Activity, City } from "@/types/itinerary";
import type { SavingsSuggestion } from "@/types/budget";
import type { Trip } from "@/types/trip";

export default function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapFilterMode>("all");
  const [mapOpenOnMobile, setMapOpenOnMobile] = useState(false);

  useEffect(() => {
    return subscribeToTrip(
      tripId,
      (next) => {
        setTrip(next);
        setLoadError(null);
        if (next && next.days.length > 0) {
          setExpandedDayId((cur) => cur ?? next.days[0].id);
        }
      },
      (err) => setLoadError(err.message),
    );
  }, [tripId]);

  const suggestions = useMemo<SavingsSuggestion[]>(
    () => (trip ? buildSavingsSuggestions(trip.cities, trip.days, trip.budget) : []),
    [trip],
  );

  /**
   * Selecting a place from the map has to reveal it in the roadmap: expand
   * the day it lives in, then scroll it into view once that day has rendered.
   * Selecting from the roadmap runs through the same path — the day is
   * already open, and `block: "nearest"` means an already-visible row doesn't
   * jump around.
   */
  const handleSelectPlace = useCallback(
    (id: string | null) => {
      setSelectedPlaceId(id);
      if (!id || !trip) return;
      if (!id.startsWith("hotel:")) {
        const day = trip.days.find((d) => d.activities.some((a) => a.id === id));
        if (day) setExpandedDayId(day.id);
      }
    },
    [trip],
  );

  useEffect(() => {
    if (!selectedPlaceId) return;
    const elementId = selectedPlaceId.startsWith("hotel:")
      ? `hotel-${selectedPlaceId.slice("hotel:".length)}`
      : `activity-${selectedPlaceId}`;
    // One frame for the newly-expanded day to mount before we measure it.
    const timer = window.setTimeout(() => {
      document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [selectedPlaceId]);

  const sortedCities = useMemo(
    () => (trip ? [...trip.cities].sort((a, b) => a.order - b.order) : []),
    [trip],
  );

  // The map's city/day filters follow whichever day the roadmap has open,
  // rather than duplicating the roadmap's navigation with its own pickers.
  const focusedDay = useMemo(
    () => trip?.days.find((d) => d.id === expandedDayId) ?? trip?.days[0] ?? null,
    [trip, expandedDayId],
  );
  const mapFilter = useMemo<MapFilter>(
    () => ({ mode: mapMode, dayId: focusedDay?.id ?? null, cityId: focusedDay?.cityId ?? null }),
    [mapMode, focusedDay],
  );

  if (loadError) {
    return <Alert>Couldn&apos;t load this trip: {loadError}</Alert>;
  }
  if (trip === undefined) {
    return <TripSkeleton />;
  }
  if (trip === null) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-zinc-500">This trip doesn&apos;t exist, or it isn&apos;t yours.</p>
        <Link href="/dashboard" className="text-sm font-medium text-orange-700 hover:underline dark:text-orange-400">
          ← Back to your trips
        </Link>
      </div>
    );
  }

  async function persist(patch: Partial<Pick<Trip, "cities" | "days" | "budget">>) {
    await updateTripItinerary(tripId, patch);
  }

  function handleAddActivity(dayId: string, activity: Activity) {
    if (!trip) return;
    const { days, budget } = addActivity(trip, dayId, activity);
    persist({ days, budget });
  }

  function handleEditActivity(dayId: string, activityId: string, patch: Partial<Activity>) {
    if (!trip) return;
    const { days, budget } = updateActivity(trip, dayId, activityId, patch);
    persist({ days, budget });
  }

  function handleDeleteActivity(dayId: string, activityId: string) {
    if (!trip) return;
    const { days, budget } = deleteActivity(trip, dayId, activityId);
    persist({ days, budget });
    if (selectedPlaceId === activityId) setSelectedPlaceId(null);
  }

  function handleReorder(dayId: string, orderedIds: string[]) {
    if (!trip) return;
    const { days, budget } = reorderActivities(trip, dayId, orderedIds);
    persist({ days, budget });
  }

  function handleEditHotel(cityId: string, patch: Partial<City["hotel"]>) {
    if (!trip) return;
    const { cities, budget } = updateHotel(trip, cityId, patch);
    persist({ cities, budget });
  }

  function handleApplySuggestion(suggestion: SavingsSuggestion) {
    if (!trip) return;
    const result = applySuggestion(trip, suggestion);
    if (result) persist(result);
  }

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/dashboard"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Your trips
      </Link>

      <TripHeader trip={trip} />

      <Tabs defaultValue="roadmap">
        <TabsList>
          <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
        </TabsList>

        <TabsContent value="roadmap" className="mt-6 focus:outline-none">
          <div className="mb-4 lg:hidden">
            <Button variant="secondary" size="sm" onClick={() => setMapOpenOnMobile((open) => !open)}>
              <MapIcon className="h-3.5 w-3.5" />
              {mapOpenOnMobile ? "Hide map" : "Show map"}
            </Button>
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
            <aside className={cn("order-1 lg:order-2", !mapOpenOnMobile && "hidden lg:block")}>
              <TripMap
                trip={trip}
                filter={mapFilter}
                onFilterChange={(next) => setMapMode(next.mode)}
                selectedId={selectedPlaceId}
                onSelect={handleSelectPlace}
                className="h-[360px] lg:sticky lg:top-24 lg:h-[calc(100vh-9rem)]"
              />
            </aside>

            <div className="order-2 flex min-w-0 flex-col gap-10 lg:order-1">
              {sortedCities.map((city) => (
                <CitySection
                  key={city.id}
                  city={city}
                  days={trip.days.filter((d) => d.cityId === city.id).sort((a, b) => a.dayNumber - b.dayNumber)}
                  currency={trip.currency}
                  expandedDayId={expandedDayId}
                  selectedPlaceId={selectedPlaceId}
                  onSelectPlace={handleSelectPlace}
                  onToggleDay={(dayId) => setExpandedDayId((cur) => (cur === dayId ? null : dayId))}
                  onEditHotel={(patch) => handleEditHotel(city.id, patch)}
                  onAddActivity={handleAddActivity}
                  onEditActivity={handleEditActivity}
                  onDeleteActivity={handleDeleteActivity}
                  onReorderActivities={handleReorder}
                />
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="budget" className="mt-6 max-w-2xl focus:outline-none">
          <BudgetPanel budget={trip.budget} suggestions={suggestions} onApplySuggestion={handleApplySuggestion} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TripSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-4 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-10 w-72 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-2.5 w-full max-w-md animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  );
}
