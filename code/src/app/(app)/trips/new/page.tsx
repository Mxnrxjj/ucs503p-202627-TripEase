"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Alert, Button } from "@/components/ui";
import { GenerationLoader } from "@/components/trips/wizard/generation-loader";
import {
  BudgetStep,
  DatesStep,
  DestinationStep,
  ReviewStep,
  StyleStep,
  TravelersStep,
  type WizardData,
} from "@/components/trips/wizard/steps";
import { WizardShell } from "@/components/trips/wizard/wizard-shell";
import { clearDraft, readDraft } from "@/lib/draft-storage";
import { toDateInputValue } from "@/lib/date";
import { saveGeneratedTrip } from "@/lib/services/trips";
import type { GeneratedItinerary, TripDraftInput } from "@/types/trip";

function defaultDates() {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

function initialData(): WizardData {
  const defaults = defaultDates();
  const draft = readDraft();
  return {
    destination: draft?.destination ?? "",
    startDate: draft?.startDate ?? defaults.start,
    endDate: draft?.endDate ?? defaults.end,
    budget: draft?.budget ? String(draft.budget) : "150000",
    currency: draft?.currency ?? "INR",
    travelerType: "couple",
    travelers: 2,
    preferences: [],
  };
}

function stepIsValid(step: number, data: WizardData): boolean {
  switch (step) {
    case 0:
      return data.destination.trim().length >= 2;
    case 1:
      return Boolean(data.startDate && data.endDate && data.endDate >= data.startDate);
    case 2:
      return Number(data.budget) > 0;
    case 3:
      return data.travelers >= 1;
    default:
      return true;
  }
}

export default function NewTripPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [data, setDataState] = useState<WizardData>(initialData);
  const [phase, setPhase] = useState<"wizard" | "generating">("wizard");
  const [itinerary, setItinerary] = useState<GeneratedItinerary | null>(null);
  const [fetchDone, setFetchDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clearDraft();
  }, []);

  function setData(patch: Partial<WizardData> | ((prev: WizardData) => Partial<WizardData>)) {
    setDataState((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }

  async function handleGenerate() {
    setError(null);
    setFetchDone(false);
    setPhase("generating");

    const draft: TripDraftInput = {
      destination: data.destination.trim(),
      startDate: data.startDate,
      endDate: data.endDate,
      budget: Number(data.budget),
      currency: data.currency,
      travelers: data.travelers,
      travelerType: data.travelerType,
      preferences: data.preferences,
    };

    try {
      const res = await fetch("/api/trips/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't generate your trip.");
      }

      if (!user) throw new Error("Not signed in.");
      const tripId = await saveGeneratedTrip(draft, body.itinerary as GeneratedItinerary);
      setItinerary(body.itinerary);
      setFetchDone(true);
      setTimeout(() => router.push(`/trips/${tripId}`), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("wizard");
    }
  }

  if (phase === "generating") {
    return <GenerationLoader destination={data.destination} done={fetchDone && itinerary !== null} />;
  }

  const isLastStep = step === 5;
  const canAdvance = stepIsValid(step, data);

  return (
    <WizardShell step={step}>
      {step === 0 && <DestinationStep data={data} setData={setData} />}
      {step === 1 && <DatesStep data={data} setData={setData} />}
      {step === 2 && <BudgetStep data={data} setData={setData} />}
      {step === 3 && <TravelersStep data={data} setData={setData} />}
      {step === 4 && <StyleStep data={data} setData={setData} />}
      {step === 5 && <ReviewStep data={data} />}

      {error ? (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {isLastStep ? (
          <Button size="lg" onClick={handleGenerate}>
            <Sparkles className="h-4 w-4" />
            Generate my trip
          </Button>
        ) : (
          <Button onClick={() => setStep((s) => Math.min(5, s + 1))} disabled={!canAdvance}>
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </WizardShell>
  );
}
