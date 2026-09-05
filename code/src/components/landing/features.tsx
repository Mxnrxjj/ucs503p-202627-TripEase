"use client";

import { motion } from "framer-motion";
import { LayoutList, MapPin, PiggyBank, Sliders, Sparkles, Wand2 } from "lucide-react";

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI itinerary",
    description: "A complete day-by-day plan generated from your destination, dates and interests.",
  },
  {
    icon: PiggyBank,
    title: "Smart budgeting",
    description: "Costs are categorized and totalled automatically, with alerts when you go over.",
  },
  {
    icon: LayoutList,
    title: "Interactive roadmap",
    description: "See your whole trip as a visual, clickable timeline — not a wall of text.",
  },
  {
    icon: MapPin,
    title: "Real places",
    description: "Attractions link to real reference sources; anything else is clearly marked as demo data.",
  },
  {
    icon: Sliders,
    title: "Flexible editing",
    description: "Reorder, add, edit or delete any activity, hotel or day — drag and drop included.",
  },
  {
    icon: Wand2,
    title: "Personalized",
    description: "Beaches, food, culture, adventure — your picks shape what gets suggested.",
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-2xl text-center"
      >
        <h2 className="font-display text-3xl font-medium tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
          Everything you need, nothing you don&apos;t
        </h2>
      </motion.div>

      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
            className="rounded-2xl border border-zinc-200 bg-white p-6 transition-shadow hover:shadow-lg hover:shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-semibold text-zinc-900 dark:text-zinc-50">{f.title}</h3>
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{f.description}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
