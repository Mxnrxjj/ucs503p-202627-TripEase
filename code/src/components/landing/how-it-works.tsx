"use client";

import { motion } from "framer-motion";
import { Compass, MapPinned, PencilRuler, Sparkles } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Tell us your trip",
    description: "Destination, dates, budget and the kind of trip you want — beaches, food, culture, adventure.",
    icon: Compass,
  },
  {
    number: "02",
    title: "TripEase plans it",
    description: "A complete day-by-day itinerary appears: cities, hotels, food, activities and costs.",
    icon: Sparkles,
  },
  {
    number: "03",
    title: "Customize everything",
    description: "Reorder, edit or replace any day, hotel or activity. Your budget updates as you go.",
    icon: PencilRuler,
  },
  {
    number: "04",
    title: "Travel",
    description: "Your roadmap stays saved and ready — pick up right where you left off, any time.",
    icon: MapPinned,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-2xl text-center"
      >
        <h2 className="font-display text-3xl font-medium tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
          How TripEase works
        </h2>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          From an idea to a fully-planned trip, in four steps.
        </p>
      </motion.div>

      <div className="relative mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div
          aria-hidden
          className="absolute top-8 left-0 right-0 hidden h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent lg:block dark:via-zinc-800"
        />
        {steps.map((step, i) => (
          <motion.div
            key={step.number}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="relative flex flex-col items-start"
          >
            <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-600/25">
              <step.icon className="h-7 w-7" />
            </div>
            <span className="mt-4 font-display text-sm font-semibold text-orange-500">{step.number}</span>
            <h3 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{step.title}</h3>
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{step.description}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
