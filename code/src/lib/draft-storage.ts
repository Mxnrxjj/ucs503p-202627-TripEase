import type { TripDraftInput } from "@/types/trip";

/**
 * The landing-page hero widget captures a trip idea before the visitor has
 * signed in. Sessionstorage carries that partial draft across the
 * sign-up/sign-in redirect so the wizard can open pre-filled instead of
 * throwing the visitor's input away.
 */
const KEY = "tripease:draft";

export type PartialDraft = Partial<TripDraftInput>;

export function saveDraft(draft: PartialDraft) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage can throw in private-browsing contexts; losing the
    // draft is an acceptable degradation, not a crash.
  }
}

export function readDraft(): PartialDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PartialDraft) : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // See saveDraft.
  }
}
