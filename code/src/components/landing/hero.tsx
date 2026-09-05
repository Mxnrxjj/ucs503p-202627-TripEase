"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { MapPin, Plane } from "lucide-react";
import { TripPlannerWidget } from "./trip-planner-widget";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-orange-50 via-amber-50/60 to-transparent dark:from-orange-950/30 dark:via-zinc-950 dark:to-transparent">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-10%] h-96 w-96 rounded-full bg-orange-200/50 blur-3xl dark:bg-orange-900/20"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-40 left-[-15%] h-72 w-72 rounded-full bg-teal-200/40 blur-3xl dark:bg-teal-900/10"
      />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-14 px-6 pb-20 pt-16 sm:pt-24 lg:flex-row lg:items-start lg:gap-10 lg:pb-32">
        <div className="flex max-w-xl flex-1 flex-col items-center text-center lg:items-start lg:text-left">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-orange-300/60 bg-white/70 px-3.5 py-1.5 text-xs font-medium text-orange-800 shadow-sm dark:border-orange-800/60 dark:bg-orange-950/40 dark:text-orange-300"
          >
            <Plane className="h-3.5 w-3.5" />
            AI-powered trip planning
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="font-display mt-5 text-4xl leading-[1.05] font-medium tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl dark:text-zinc-50"
          >
            Plan less.
            <br />
            <span className="text-orange-600">Travel more.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 max-w-md text-lg text-zinc-600 dark:text-zinc-400"
          >
            TripEase turns your destination, dates and budget into a personalized
            day-by-day adventure — complete with hotels, food, activities and a
            budget that updates as you edit.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
          >
            <Link href="/sign-up">
              <button className="inline-flex h-12 items-center justify-center rounded-full bg-orange-600 px-6 text-base font-medium text-white shadow-sm shadow-orange-600/20 transition-colors hover:bg-orange-700 active:scale-[0.98]">
                Start planning
              </button>
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full px-6 text-base font-medium text-zinc-700 transition-colors hover:bg-zinc-900/5 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              <MapPin className="h-4 w-4" />
              Explore how it works
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 hidden items-center gap-6 text-sm text-zinc-500 sm:flex"
          >
            <span>🇹🇭 Thailand</span>
            <span>🇮🇹 Italy</span>
            <span>🇯🇵 Japan</span>
            <span>🇮🇩 Bali</span>
            <span className="text-zinc-400">…or anywhere you dream up</span>
          </motion.div>
        </div>

        <div className="flex w-full flex-1 justify-center lg:justify-end">
          <TripPlannerWidget />
        </div>
      </div>
    </section>
  );
}
