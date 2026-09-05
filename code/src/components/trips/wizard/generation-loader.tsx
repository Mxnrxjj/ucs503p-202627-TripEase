"use client";

import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { CityPlan } from "@/types/planning";

/**
 * The generation screen.
 *
 * Every line here corresponds to a real step the app is actually performing —
 * the stage advances when the work does, not on a timer, and there's no
 * invented percentage. When the planner has chosen cities they're shown
 * immediately, which is both a genuine progress signal and the most
 * interesting thing to look at while the places lookups run.
 */
export type GenerationStage = "planning" | "places" | "saving" | "roadmap";

/**
 * Four stages, because there are exactly four real boundaries in the work:
 * the plan request, the generate request, the Firestore write, and the
 * navigation. Splitting "finding places" from "building your itinerary" would
 * look nicer but they're one server call — showing them as separate steps
 * would be inventing progress, which is the thing this screen must not do.
 */
const STAGES: { id: GenerationStage; label: string }[] = [
  { id: "planning", label: "Planning your cities" },
  { id: "places", label: "Finding real places and building your itinerary" },
  { id: "saving", label: "Checking your budget and saving your trip" },
  { id: "roadmap", label: "Preparing your roadmap" },
];

export function GenerationLoader({
  destination,
  stage,
  plan,
  done,
}: {
  destination: string;
  stage: GenerationStage;
  plan: CityPlan | null;
  done: boolean;
}) {
  const activeIndex = STAGES.findIndex((s) => s.id === stage);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-8 py-16 text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950"
      >
        <span className="text-2xl">✨</span>
      </motion.div>

      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight text-zinc-900 dark:text-zinc-50">
          Creating your {destination} adventure…
        </h1>
        <p className="mt-1 text-sm text-zinc-500">This usually takes just a few seconds.</p>
      </div>

      <ul className="flex w-full flex-col gap-3 text-left">
        {STAGES.map((s, i) => {
          const state = done || i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <li key={s.id} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  state === "done" && "bg-emerald-500 text-white",
                  state === "active" && "bg-orange-100 text-orange-600 dark:bg-orange-950",
                  state === "pending" && "bg-zinc-100 dark:bg-zinc-800",
                )}
              >
                {state === "done" ? (
                  <Check className="h-3 w-3" />
                ) : state === "active" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
              </span>
              <span
                className={cn(
                  state === "done" && "text-zinc-500",
                  state === "active" && "font-medium text-zinc-900 dark:text-zinc-100",
                  state === "pending" && "text-zinc-400",
                )}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>

      {plan ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full rounded-2xl border border-zinc-200 p-4 text-left dark:border-zinc-800"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Your route</p>
            {plan.source === "fallback" ? (
              <Badge tone="amber">TripEase planner</Badge>
            ) : (
              <Badge tone="orange">AI planned</Badge>
            )}
          </div>
          <ul className="flex flex-col gap-1.5">
            {plan.cities.map((city) => (
              <li key={city.name} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{city.name}</span>
                <span className="text-xs text-zinc-500">
                  {city.days} {city.days === 1 ? "day" : "days"}
                  {city.reason ? ` · ${city.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {plan.source === "fallback" ? (
            <p className="mt-3 text-xs text-zinc-500">
              AI planning is unavailable right now, so TripEase planned this route itself.
            </p>
          ) : null}
        </motion.div>
      ) : null}
    </div>
  );
}
