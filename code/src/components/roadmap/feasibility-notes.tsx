"use client";

import { AlertTriangle, Clock, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayFeasibility } from "@/types/travel";

/**
 * Feasibility feedback, sized to how much it matters.
 *
 * A day that genuinely doesn't fit gets a real warning; a city transfer gets a
 * quiet note. Nothing here blocks the traveller or shouts — the itinerary is
 * theirs, and the engine's job is to tell them what it noticed, in words that
 * mean something to a person planning a holiday.
 */
export function FeasibilityNotes({ feasibility }: { feasibility: DayFeasibility }) {
  if (feasibility.warnings.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {feasibility.warnings.map((warning) => {
        const Icon =
          warning.severity === "problem" ? AlertTriangle : warning.severity === "warning" ? Clock : Info;
        return (
          <li
            key={`${warning.code}-${warning.message}`}
            className={cn(
              "flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs",
              warning.severity === "problem" &&
                "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
              warning.severity === "warning" &&
                "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
              warning.severity === "info" && "text-zinc-500",
            )}
          >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{warning.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** A one-line time budget for the day, shown under the header. */
export function DayTimeSummary({ feasibility }: { feasibility: DayFeasibility }) {
  const hours = (minutes: number) => (minutes / 60).toFixed(1);
  return (
    <span className="text-xs text-zinc-500">
      ~{hours(feasibility.totalMinutes)}h planned · {hours(feasibility.travelMinutes)}h travel (est.)
    </span>
  );
}
