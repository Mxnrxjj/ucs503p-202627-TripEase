"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-[2rem] bg-zinc-900 px-8 py-16 text-center dark:bg-orange-950"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-orange-600/30 blur-3xl"
        />
        <h2 className="font-display relative text-3xl font-medium tracking-tight text-white sm:text-4xl">
          Your next adventure is waiting.
        </h2>
        <p className="relative mx-auto mt-3 max-w-md text-zinc-300">
          Tell TripEase where you want to go — the rest of the plan takes minutes, not weekends.
        </p>
        <Link href="/sign-up" className="relative mt-8 inline-block">
          <button className="inline-flex h-12 items-center justify-center rounded-full bg-orange-600 px-7 text-base font-medium text-white shadow-lg shadow-orange-600/30 transition-colors hover:bg-orange-500 active:scale-[0.98]">
            Create my trip
          </button>
        </Link>
      </motion.div>
    </section>
  );
}
