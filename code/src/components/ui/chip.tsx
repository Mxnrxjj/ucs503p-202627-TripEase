import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Chip({
  selected = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all",
        selected
          ? "border-orange-600 bg-orange-600 text-white shadow-sm shadow-orange-600/25"
          : "border-zinc-300 bg-white text-zinc-700 hover:border-orange-400 hover:bg-orange-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
        className,
      )}
      {...props}
    />
  );
}
