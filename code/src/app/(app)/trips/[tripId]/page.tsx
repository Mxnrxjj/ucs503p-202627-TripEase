"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { CitySection } from "@/components/roadmap/city-section";
import { TripHeader } from "@/components/roadmap/trip-header";
import { BudgetPanel } from "@/components/budget/budget-panel";
import { MockMap } from "@/components/maps/mock-map";
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
import type { Activity, City } from "@/types/itinerary";
import type { SavingsSuggestion } from "@/types/budget";
import type { Trip } from "@/types/trip";

export default function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);

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

  const sortedCities = [...trip.cities].sort((a, b) => a.order - b.order);

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
          <TabsTrigger value="map">Map</TabsTrigger>
        </TabsList>

        <TabsContent value="roadmap" className="mt-6 flex flex-col gap-10 focus:outline-none">
          {sortedCities.map((city) => (
            <CitySection
              key={city.id}
              city={city}
              days={trip.days.filter((d) => d.cityId === city.id).sort((a, b) => a.dayNumber - b.dayNumber)}
              currency={trip.currency}
              expandedDayId={expandedDayId}
              onToggleDay={(dayId) => setExpandedDayId((cur) => (cur === dayId ? null : dayId))}
              onEditHotel={(patch) => handleEditHotel(city.id, patch)}
              onAddActivity={handleAddActivity}
              onEditActivity={handleEditActivity}
              onDeleteActivity={handleDeleteActivity}
              onReorderActivities={handleReorder}
            />
          ))}
        </TabsContent>

        <TabsContent value="budget" className="mt-6 max-w-2xl focus:outline-none">
          <BudgetPanel budget={trip.budget} suggestions={suggestions} onApplySuggestion={handleApplySuggestion} />
        </TabsContent>

        <TabsContent value="map" className="mt-6 max-w-2xl focus:outline-none">
          <MockMap cities={sortedCities} days={trip.days} />
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
