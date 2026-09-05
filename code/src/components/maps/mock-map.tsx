"use client";

import { ArrowDown, ArrowRight, BedDouble, MapPin } from "lucide-react";
import { useState } from "react";
import { Badge, Card } from "@/components/ui";
import type { City, TripDay } from "@/types/itinerary";

/**
 * A visual, CSS-drawn route — not a real map. There's no Google Maps/Places
 * key configured, so this stands in for it; swapping in a live map later
 * means replacing this component's internals, not the roadmap page that
 * renders it.
 */
export function MockMap({ cities, days }: { cities: City[]; days: TripDay[] }) {
  const [selectedCityId, setSelectedCityId] = useState(cities[0]?.id ?? "");
  const selectedCity = cities.find((c) => c.id === selectedCityId) ?? cities[0];
  const cityDays = days.filter((d) => d.cityId === selectedCity?.id);
  const stops = cityDays.flatMap((d) => d.activities).filter((a) => a.category !== "transport");
  const uniqueStops = Array.from(new Map(stops.map((s) => [s.name, s])).values()).slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <Badge tone="amber">Demo map — connect a Maps API for live directions</Badge>

      <Card>
        <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Route between cities</h3>
        <div className="flex flex-wrap items-center gap-3">
          {cities.map((city, i) => (
            <div key={city.id} className="flex items-center gap-3">
              <button
                onClick={() => setSelectedCityId(city.id)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  selectedCity?.id === city.id
                    ? "border-orange-600 bg-orange-600 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                }`}
              >
                {city.name}
              </button>
              {i < cities.length - 1 ? <ArrowRight className="h-4 w-4 text-zinc-300" /> : null}
            </div>
          ))}
        </div>
      </Card>

      {selectedCity ? (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Getting around {selectedCity.name}
          </h3>
          <div className="flex flex-col items-start">
            <MapNode icon={<BedDouble className="h-4 w-4" />} label={selectedCity.hotel.name} tone="orange" />
            {uniqueStops.map((stop) => (
              <div key={stop.id} className="flex flex-col items-start">
                <ArrowDown className="ml-4 my-1 h-4 w-4 text-zinc-300" />
                <MapNode icon={<MapPin className="h-4 w-4" />} label={stop.name} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function MapNode({
  icon,
  label,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "neutral" | "orange";
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          tone === "orange"
            ? "bg-orange-600 text-white"
            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        }`}
      >
        {icon}
      </span>
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
    </div>
  );
}
