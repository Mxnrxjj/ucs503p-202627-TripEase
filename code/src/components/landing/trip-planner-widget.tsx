"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveDraft } from "@/lib/draft-storage";
import { toDateInputValue } from "@/lib/date";

function defaultDates() {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

export function TripPlannerWidget() {
  const router = useRouter();
  const initial = defaultDates();
  const [destination, setDestination] = useState("Thailand");
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [budget, setBudget] = useState("150000");
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    saveDraft({
      destination: destination.trim() || "Thailand",
      startDate,
      endDate,
      budget: Number(budget) || 150000,
      currency: "INR",
    });
    router.push("/sign-up");
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md rounded-3xl border border-zinc-900/10 bg-white/90 p-5 shadow-xl shadow-orange-900/5 backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/90"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hero-destination" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Where do you want to go?
          </label>
          <Input
            id="hero-destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Thailand"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hero-start" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              From
            </label>
            <Input
              id="hero-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="hero-end" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              To
            </label>
            <Input
              id="hero-end"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="hero-budget" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Budget (₹)
          </label>
          <Input
            id="hero-budget"
            type="number"
            min={0}
            inputMode="numeric"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="1,50,000"
          />
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          <Sparkles className="h-4 w-4" />
          {submitting ? "Taking you there…" : "Create my itinerary"}
        </Button>
        <p className="text-center text-xs text-zinc-500">
          Free to try. Sign up in seconds to save your trip.
        </p>
      </div>
    </motion.form>
  );
}
