"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ExternalLink, GripVertical, Pencil, Trash2 } from "lucide-react";
import { ACTIVITY_CATEGORY_ICON, type Activity } from "@/types/itinerary";
import { Badge } from "@/components/ui";
import { cn, formatMoney } from "@/lib/utils";

export function ActivityRow({
  activity,
  onEdit,
  onDelete,
}: {
  activity: Activity;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex gap-3 rounded-xl border border-transparent px-3 py-3 transition-colors hover:border-zinc-200 hover:bg-zinc-50 dark:hover:border-zinc-800 dark:hover:bg-zinc-800/40",
        isDragging && "z-10 border-orange-300 bg-white shadow-lg dark:bg-zinc-900",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-1 shrink-0 cursor-grab touch-none text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-zinc-600"
        aria-label={`Reorder ${activity.name}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="w-14 shrink-0 pt-0.5 text-sm font-medium tabular-nums text-zinc-500">{activity.time}</div>

      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden>{ACTIVITY_CATEGORY_ICON[activity.category]}</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{activity.name}</span>
          {activity.isDemoData ? <Badge tone="amber">Demo data</Badge> : null}
        </div>
        {activity.description ? (
          <p className="mt-0.5 text-sm text-zinc-500">{activity.description}</p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {activity.estimatedCost > 0 ? formatMoney(activity.estimatedCost, activity.currency) : "Free"}
          </span>
          {activity.durationMinutes > 0 ? (
            <span>
              {activity.durationMinutes >= 60
                ? `${Math.round(activity.durationMinutes / 60)}h`
                : `${activity.durationMinutes}m`}
            </span>
          ) : null}
          {activity.referenceUrl ? (
            <a
              href={activity.referenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-orange-700 hover:underline dark:text-orange-400"
            >
              View reference <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-start gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onEdit}
          aria-label={`Edit ${activity.name}`}
          className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          aria-label={`Delete ${activity.name}`}
          className="rounded-full p-1.5 text-zinc-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
