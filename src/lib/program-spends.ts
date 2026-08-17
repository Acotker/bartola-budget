import { prisma } from "./db";

/**
 * The single place a Program Spend gets created.
 *
 * Extracted from `createProgramAction` so the manual form and the subscription
 * import both go through one path (import spec §7 requires reuse, not a
 * parallel implementation). Callers are responsible for verifying that the plan
 * belongs to the current user before calling.
 */

export type ProgramSpendKind = "daily" | "weekly" | "biweekly" | "monthly" | "onetime";

export const RECURRING_KINDS: ProgramSpendKind[] = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
];

export function isRecurringKind(kind: string): boolean {
  return (RECURRING_KINDS as string[]).includes(kind);
}

export interface CreateProgramSpendInput {
  planId: string;
  name: string;
  amountPerOccurrenceCents: number;
  kind: ProgramSpendKind;
  /** Day of month, monthly only. Defaults to 1. */
  anchorDay?: number | null;
  /** 1=Mon..7=Sun, weekly/biweekly only. Defaults to 1. */
  anchorWeekday?: number | null;
  /** Required for `onetime`. */
  targetDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  /** The date the Program Spend entered the plan (drives "effective tomorrow"). */
  addedOn: string;
}

export async function createProgramSpendForPlan(
  input: CreateProgramSpendInput,
): Promise<{ id: string }> {
  const {
    planId,
    name,
    amountPerOccurrenceCents,
    kind,
    targetDate,
    startDate,
    endDate,
    addedOn,
  } = input;

  if (kind === "onetime") {
    if (!targetDate) throw new Error("A one-time Program Spend needs a target date.");
    const created = await prisma.programSpend.create({
      data: {
        planId,
        name,
        isRecurring: false,
        amountPerOccurrenceCents,
        targetDate,
        addedOn,
      },
    });
    return { id: created.id };
  }

  const freq = isRecurringKind(kind) ? kind : "monthly";
  const anchorDay = freq === "monthly" ? (input.anchorDay ?? 1) : null;
  const anchorWeekday =
    freq === "weekly" || freq === "biweekly" ? (input.anchorWeekday ?? 1) : null;

  const created = await prisma.programSpend.create({
    data: {
      planId,
      name,
      isRecurring: true,
      freq,
      anchorDay,
      anchorWeekday,
      amountPerOccurrenceCents,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      addedOn,
    },
  });
  return { id: created.id };
}
