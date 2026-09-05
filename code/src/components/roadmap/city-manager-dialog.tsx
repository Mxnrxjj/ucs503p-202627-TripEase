"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, Button, Dialog, DialogContent, DialogFooter, Input } from "@/components/ui";
import { validateCityAllocation } from "@/lib/services/planning/validate";
import { splitDaysAcrossCities } from "@/lib/services/planning/split-days";
import { cn } from "@/lib/utils";
import type { CityAllocation } from "@/types/planning";

/**
 * Editing which cities a trip visits.
 *
 * The hard invariant — city days must sum to exactly the trip length — is
 * enforced two ways: the dialog rebalances automatically when a city is added
 * or removed so the traveller rarely has to think about it, and Save stays
 * disabled until the totals agree. It runs the same
 * `validateCityAllocation` the AI planner's output must pass, so there's one
 * definition of a legal allocation rather than a second, looser one for
 * hand edits. The server re-validates regardless.
 */
export function CityManagerDialog({
  open,
  onOpenChange,
  cities,
  dayCount,
  destination,
  travelers,
  budget,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cities: CityAllocation[];
  dayCount: number;
  destination: string;
  travelers: number;
  budget: number;
  onSave: (cities: CityAllocation[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CityAllocation[]>(cities);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const allocated = draft.reduce((sum, c) => sum + (Number.isFinite(c.days) ? c.days : 0), 0);
  const validation = useMemo(
    () => validateCityAllocation(draft, { destination, dayCount, travelers, budget }),
    [draft, destination, dayCount, travelers, budget],
  );

  function reset() {
    setDraft(cities);
    setServerError(null);
  }

  /** Spread `dayCount` days across the given cities, keeping their relative sizes. */
  function rebalance(next: CityAllocation[]): CityAllocation[] {
    if (next.length === 0) return next;
    const weights = next.map((c) => Math.max(1, c.days));
    const days = splitDaysAcrossCities(dayCount, weights);
    return next.map((city, i) => ({ ...city, days: days[i] }));
  }

  function addCity() {
    if (draft.length >= dayCount) return;
    setDraft(rebalance([...draft, { name: "", days: 1, reason: "Added by you" }]));
  }

  function removeCity(index: number) {
    if (draft.length <= 1) return;
    setDraft(rebalance(draft.filter((_, i) => i !== index)));
  }

  function updateCity(index: number, patch: Partial<CityAllocation>) {
    setDraft(draft.map((city, i) => (i === index ? { ...city, ...patch } : city)));
  }

  async function handleSave() {
    setSaving(true);
    setServerError(null);
    try {
      await onSave(draft.map((c) => ({ ...c, name: c.name.trim() })));
      onOpenChange(false);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Couldn't update your cities.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="Edit cities"
        description={`Your trip is ${dayCount} days. City days must add up to that.`}
      >
        <ul className="flex flex-col gap-2">
          {draft.map((city, index) => (
            <li key={index} className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor={`city-name-${index}`} className="sr-only">
                  City {index + 1} name
                </label>
                <Input
                  id={`city-name-${index}`}
                  value={city.name}
                  placeholder="City name"
                  onChange={(e) => updateCity(index, { name: e.target.value })}
                />
              </div>
              <div className="w-24">
                <label htmlFor={`city-days-${index}`} className="sr-only">
                  Days in {city.name || `city ${index + 1}`}
                </label>
                <Input
                  id={`city-days-${index}`}
                  type="number"
                  min={1}
                  max={dayCount}
                  value={city.days}
                  onChange={(e) => updateCity(index, { days: Math.trunc(Number(e.target.value)) || 0 })}
                />
              </div>
              <button
                type="button"
                onClick={() => removeCity(index)}
                disabled={draft.length <= 1}
                aria-label={`Remove ${city.name || `city ${index + 1}`}`}
                className="mb-1 rounded-full p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={addCity} disabled={draft.length >= dayCount}>
            <Plus className="h-3.5 w-3.5" />
            Add city
          </Button>
          <span
            className={cn(
              "text-xs font-medium",
              allocated === dayCount ? "text-emerald-600" : "text-amber-600",
            )}
          >
            {allocated} of {dayCount} days allocated
          </span>
        </div>

        {!validation.ok ? (
          <div className="mt-3">
            <Alert tone="warning">{validation.problems[0]}</Alert>
          </div>
        ) : null}
        {serverError ? (
          <div className="mt-3">
            <Alert>{serverError}</Alert>
          </div>
        ) : null}

        <p className="mt-3 text-xs text-zinc-500">
          Cities you keep hold on to their existing plans. New or renamed cities get fresh
          recommendations, and your budget updates automatically.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!validation.ok || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Updating…" : "Save cities"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
