"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const WIZARD_STEPS = ["Destination", "Dates", "Budget", "Travelers", "Style", "Review"];

export function WizardShell({
  step,
  children,
}: {
  step: number;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <ol className="flex items-center gap-2">
        {WIZARD_STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className={cn(
                "h-1.5 w-full rounded-full transition-colors duration-300",
                i <= step ? "bg-orange-600" : "bg-zinc-200 dark:bg-zinc-800",
              )}
            />
            <span
              className={cn(
                "hidden text-[11px] font-medium sm:block",
                i === step ? "text-orange-700 dark:text-orange-400" : "text-zinc-400",
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      <motion.div
        key={step}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-medium tracking-tight text-zinc-900 dark:text-zinc-50">
        {title}
      </h1>
      {subtitle ? <p className="mt-1.5 text-sm text-zinc-500">{subtitle}</p> : null}
    </div>
  );
}
