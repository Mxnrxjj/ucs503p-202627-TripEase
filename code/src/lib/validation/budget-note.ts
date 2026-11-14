import { z } from "zod";

/**
 * Two boundaries for the short note a model may write about a budget that is
 * too low (see `@/lib/services/budget-note`).
 *
 * `llmBudgetNoteSchema` is the door out of the model. The note may only
 * explain: every figure the traveller sees comes from the budget check, so a
 * note with any digit in it is refused outright rather than risk it stating a
 * number that disagrees with them. It must be one short paragraph of plain
 * text, with no links.
 *
 * `budgetNoteSchema` is what is saved with a trip: the note plus the figures
 * it was written for, so it is shown only while they still hold.
 */

export const MAX_BUDGET_NOTE_CHARS = 320;

export const budgetNoteTextSchema = z
  .string()
  .trim()
  .min(20)
  .max(MAX_BUDGET_NOTE_CHARS)
  .refine((text) => !/\d/.test(text), { message: "The note may not contain numbers." })
  .refine((text) => !/[\r\n]/.test(text), { message: "The note must be one paragraph." })
  .refine((text) => !/https?:|www\.|<|>/i.test(text), { message: "The note may not contain links or markup." });

export const llmBudgetNoteSchema = z.object({ note: budgetNoteTextSchema });

export type LlmBudgetNote = z.infer<typeof llmBudgetNoteSchema>;

export const budgetNoteSchema = z.object({
  text: budgetNoteTextSchema,
  /** The minimum budget the note was written about, in `currency`. */
  minimumBudget: z.number().nonnegative(),
  /** The traveller's budget when it was written, in `currency`. */
  budget: z.number().nonnegative(),
  currency: z.string().min(3).max(3),
});
