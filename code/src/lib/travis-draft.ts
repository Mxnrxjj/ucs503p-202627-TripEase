import { saveDraft, saveDraftOrigin, type PartialDraft } from "@/lib/draft-storage";
import { cleanFocus, destinationLabel } from "@/lib/trip-focus";
import type { DestinationSuggestion } from "@/types/travis";

/**
 * From one of Travis's suggestions to a wizard that is already half filled in.
 *
 * Only what the suggestion genuinely knows is carried over: where (the country,
 * and the place inside it if Travis named one), when, and the styles it
 * matched. Budget, currency and who is travelling are the traveller's to say —
 * Travis never asked, so the wizard keeps asking.
 */
export function suggestionToDraft(suggestion: DestinationSuggestion): PartialDraft {
  // A suggestion can come back from session storage, so the place is checked
  // again here rather than trusted: one that isn't a usable place is left out.
  const focus = cleanFocus(suggestion.focus, suggestion.destination);
  return {
    destination: suggestion.destination,
    ...(focus ? { focus } : {}),
    startDate: suggestion.startDate,
    endDate: suggestion.endDate,
    // A style is optional in the wizard; if Travis named none, leave the
    // choice to the traveller rather than inventing one.
    ...(suggestion.styles.length > 0 ? { preferences: suggestion.styles } : {}),
  };
}

/** Hand a suggestion to the wizard (via session storage) ready for it to open. */
export function startTripFromSuggestion(suggestion: DestinationSuggestion): void {
  saveDraft(suggestionToDraft(suggestion));
  saveDraftOrigin({
    source: "travis",
    destination: destinationLabel(suggestion.destination, suggestion.focus),
    windowLabel: suggestion.windowLabel,
  });
}
