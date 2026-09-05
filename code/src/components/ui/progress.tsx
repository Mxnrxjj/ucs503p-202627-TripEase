"use client";

import * as RadixProgress from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export function Progress({
  value,
  className = "",
  barClassName = "",
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <RadixProgress.Root
      value={clamped}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800", className)}
    >
      <RadixProgress.Indicator
        className={cn(
          "h-full rounded-full bg-orange-600 transition-transform duration-500 ease-out",
          clamped > 100 ? "bg-red-500" : "",
          barClassName,
        )}
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </RadixProgress.Root>
  );
}
