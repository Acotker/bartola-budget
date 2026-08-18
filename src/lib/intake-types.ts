// Shared shapes for the intake wizard payload. Kept out of the "use server"
// action file, which may only export async functions.

export interface IntakeAssetInput {
  label: string;
  balanceCents: number;
  spendable: boolean;
}

export interface IntakeTrancheInput {
  label: string;
  kind: string;
  grossCents: number;
  feesCents: number;
  passthroughCents: number;
  expectedDate: string;
  certainty: string;
}

export interface IntakeObligationInput {
  name: string;
  amountPerOccurrenceCents: number;
  isRecurring: boolean;
  freq?: string;
  anchorDay?: number;
  targetDate?: string;
}

export interface IntakePayload {
  displayName: string;
  startDate: string;
  endDate: string;
  bufferCents: number;
  assets: IntakeAssetInput[];
  tranches: IntakeTrancheInput[];
  obligations: IntakeObligationInput[];
}

/** Abbreviated intake for a partner joining an existing household (§8.2). The
 *  horizon is already set by the household, so only personal holdings are
 *  captured — never a repeat of household setup. */
export interface PartnerIntakePayload {
  displayName: string;
  bufferCents: number;
  assets: IntakeAssetInput[];
  tranches: IntakeTrancheInput[];
  obligations: IntakeObligationInput[];
}
