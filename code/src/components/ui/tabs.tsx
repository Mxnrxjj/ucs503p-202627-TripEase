"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ className, ...props }: RadixTabs.TabsListProps) {
  return (
    <RadixTabs.List
      className={cn(
        "inline-flex gap-1 rounded-full border border-zinc-200 bg-zinc-100/70 p-1 dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: RadixTabs.TabsTriggerProps) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium text-zinc-500 transition-colors",
        "data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm",
        "dark:data-[state=active]:bg-zinc-700 dark:data-[state=active]:text-white",
        "hover:text-zinc-800 dark:hover:text-zinc-200",
        className,
      )}
      {...props}
    />
  );
}
