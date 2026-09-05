"use client";

import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Understanding your preferences",
  "Planning your destinations",
  "Optimizing your route",
  "Finding places to visit",
  "Estimating accommodation",
  "Planning activities",
  "Calculating your budget",
  "Finalizing your itinerary",
];

/**
 * Purely cosmetic staged progress — the real work (the fetch to
 * /api/trips/generate) happens in parallel in the wizard. `done` flips this
 * over to a "ready" state once that fetch resolves, even if the checklist
 * hasn't finished animating yet.
 */
export function GenerationLoader({ destination, done }: { destination: string; done: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= STEPS.length - 1) return;
    const delay = done ? 120 : 550 + Math.random() * 350;
    const timer = setTimeout(() => setActiveIndex((i) => i + 1), delay);
    return () => clearTimeout(timer);
  }, [activeIndex, done]);

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
        {STEPS.map((label, i) => {
          const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <motion.li
              key={label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: state === "pending" ? 0.4 : 1, x: 0 }}
              className="flex items-center gap-3 text-sm"
            >
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
                  state === "done" && "text-zinc-500 line-through decoration-zinc-300",
                  state === "active" && "font-medium text-zinc-900 dark:text-zinc-100",
                  state === "pending" && "text-zinc-400",
                )}
              >
                {label}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
