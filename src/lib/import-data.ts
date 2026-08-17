import { prisma } from "./db";
import { APP_ASOF, loadActivePlan } from "./data";
import {
  createProgramSpendForPlan,
  isRecurringKind,
  type ProgramSpendKind,
} from "./program-spends";
import { monthlyEquivalentCents } from "@/import";
import type { Cadence, Candidate, ParseResult } from "@/import";
import { daysInclusive, type EngineInput } from "@/engine";

/**
 * DB layer for subscription import. The detection pipeline in `src/import/`
 * stays pure; everything that touches Postgres lives here.
 */

export interface PersistImportArgs {
  userId: string;
  planId: string | null;
  originalFilename: string | null;
  parse: ParseResult;
  candidates: Candidate[];
}

export async function persistImport(args: PersistImportArgs): Promise<string> {
  const { userId, planId, originalFilename, parse, candidates } = args;

  const upload = await prisma.importUpload.create({
    data: {
      userId,
      planId,
      originalFilename,
      rowCount: parse.totalRows,
      skippedRowCount: parse.skippedRows,
      status: "ready",
    },
  });

  const claimed = new Set<unknown>();

  for (const c of candidates) {
    const candidate = await prisma.importCandidate.create({
      data: {
        uploadId: upload.id,
        normalizedMerchant: c.normalizedMerchant,
        suggestedName: c.suggestedName,
        suggestedAmountCents: c.suggestedAmountCents,
        minAmountCents: c.minAmountCents,
        maxAmountCents: c.maxAmountCents,
        occurrenceCount: c.occurrenceCount,
        suggestedCadence: c.suggestedCadence,
        confidenceTier: c.confidenceTier,
        anchorDay: c.anchorDay ?? null,
        anchorWeekday: c.anchorWeekday ?? null,
        firstSeenDate: c.firstSeenDate,
        lastSeenDate: c.lastSeenDate,
        fingerprint: c.fingerprint,
      },
    });

    if (c.sourceTransactions.length > 0) {
      await prisma.importTransaction.createMany({
        data: c.sourceTransactions.map((t) => {
          claimed.add(t);
          return {
            uploadId: upload.id,
            candidateId: candidate.id,
            transactionDate: t.date,
            rawDescription: t.rawDescription,
            normalizedDescription: t.normalizedDescription,
            amountCents: t.amountCents,
            sourceAccountLabel: t.sourceAccountLabel ?? null,
          };
        }),
      });
    }
  }

  // Transactions that didn't form a candidate are still retained (spec §9) so a
  // future reconciliation pass has the full history to diff against.
  const unmatched = parse.transactions.filter((t) => !claimed.has(t));
  if (unmatched.length > 0) {
    await prisma.importTransaction.createMany({
      data: unmatched.map((t) => ({
        uploadId: upload.id,
        candidateId: null,
        transactionDate: t.date,
        rawDescription: t.rawDescription,
        normalizedDescription: t.normalizedDescription,
        amountCents: t.amountCents,
        sourceAccountLabel: t.sourceAccountLabel ?? null,
      })),
    });
  }

  return upload.id;
}

export interface ReviewCandidate {
  id: string;
  suggestedName: string;
  suggestedAmountCents: number;
  minAmountCents: number;
  maxAmountCents: number;
  occurrenceCount: number;
  suggestedCadence: Cadence;
  confidenceTier: "high" | "possible";
  anchorDay: number | null;
  anchorWeekday: number | null;
  firstSeenDate: string;
  lastSeenDate: string;
  monthlyEquivalentCents: number;
  /** Average gap between sightings, for the "about 30 days apart" copy. */
  averageGapDays: number | null;
  status: string;
  alreadyLinked: boolean;
}

export interface ImportReviewView {
  uploadId: string;
  planId: string;
  input: EngineInput;
  asOf: string;
  planEndDate: string;
  rowCount: number;
  skippedRowCount: number;
  candidates: ReviewCandidate[];
}

export async function getImportReview(
  userId: string,
  uploadId: string,
): Promise<ImportReviewView | null> {
  const upload = await prisma.importUpload.findFirst({
    where: { id: uploadId, userId },
    include: { candidates: true },
  });
  if (!upload) return null;

  const loaded = await loadActivePlan(userId);
  if (!loaded) return null;

  const candidates: ReviewCandidate[] = upload.candidates
    .map((c) => ({
      id: c.id,
      suggestedName: c.suggestedName,
      suggestedAmountCents: c.suggestedAmountCents,
      minAmountCents: c.minAmountCents,
      maxAmountCents: c.maxAmountCents,
      occurrenceCount: c.occurrenceCount,
      suggestedCadence: c.suggestedCadence as Cadence,
      confidenceTier: c.confidenceTier === "high" ? ("high" as const) : ("possible" as const),
      anchorDay: c.anchorDay,
      anchorWeekday: c.anchorWeekday,
      firstSeenDate: c.firstSeenDate,
      lastSeenDate: c.lastSeenDate,
      monthlyEquivalentCents: monthlyEquivalentCents(
        c.suggestedAmountCents,
        c.suggestedCadence as Cadence,
      ),
      averageGapDays:
        c.occurrenceCount > 1
          ? Math.round(
              (daysInclusive(c.firstSeenDate, c.lastSeenDate) - 1) /
                (c.occurrenceCount - 1),
            )
          : null,
      status: c.status,
      alreadyLinked: c.linkedProgramSpendId != null,
    }))
    .sort((a, b) => b.monthlyEquivalentCents - a.monthlyEquivalentCents);

  return {
    uploadId: upload.id,
    planId: loaded.planId,
    input: loaded.input,
    asOf: APP_ASOF,
    planEndDate: loaded.input.plan.endDate,
    rowCount: upload.rowCount,
    skippedRowCount: upload.skippedRowCount,
    candidates,
  };
}

export interface CandidateDecision {
  candidateId: string;
  accepted: boolean;
  name?: string;
  amountCents?: number;
  cadence?: Cadence;
  startDate?: string;
  endDate?: string;
}

export interface ConfirmResult {
  created: number;
  rejected: number;
}

/**
 * Turn confirmed candidates into Program Spends.
 *
 * Creation goes through `createProgramSpendForPlan` — the same path the manual
 * form uses — so there is exactly one place a Program Spend comes into being.
 */
export async function confirmCandidates(
  userId: string,
  uploadId: string,
  decisions: CandidateDecision[],
): Promise<ConfirmResult> {
  const upload = await prisma.importUpload.findFirst({
    where: { id: uploadId, userId },
    include: { candidates: true },
  });
  if (!upload) return { created: 0, rejected: 0 };

  const loaded = await loadActivePlan(userId);
  if (!loaded) return { created: 0, rejected: 0 };

  const byId = new Map(upload.candidates.map((c) => [c.id, c]));
  let created = 0;
  let rejected = 0;

  for (const decision of decisions) {
    const candidate = byId.get(decision.candidateId);
    if (!candidate) continue;
    // Never create the same candidate twice, even if confirm is submitted twice.
    if (candidate.linkedProgramSpendId) continue;

    if (!decision.accepted) {
      await prisma.importCandidate.update({
        where: { id: candidate.id },
        data: { status: "rejected" },
      });
      rejected += 1;
      continue;
    }

    const cadence = (decision.cadence ?? candidate.suggestedCadence) as Cadence;
    const amountCents = decision.amountCents ?? candidate.suggestedAmountCents;
    if (!Number.isFinite(amountCents) || amountCents <= 0) continue;

    const name = (decision.name ?? candidate.suggestedName).trim() || candidate.suggestedName;
    const kind: ProgramSpendKind = isRecurringKind(cadence)
      ? (cadence as ProgramSpendKind)
      : "onetime";

    // Start today, never backdated: reserving history the user already lived
    // through would distort a plan that's already running.
    const startDate = decision.startDate ?? APP_ASOF;
    const endDate = decision.endDate ?? loaded.input.plan.endDate;

    const program = await createProgramSpendForPlan({
      planId: loaded.planId,
      name,
      amountPerOccurrenceCents: amountCents,
      kind,
      anchorDay: candidate.anchorDay ?? undefined,
      anchorWeekday: candidate.anchorWeekday ?? undefined,
      targetDate: kind === "onetime" ? startDate : undefined,
      startDate: kind === "onetime" ? undefined : startDate,
      endDate: kind === "onetime" ? undefined : endDate,
      addedOn: APP_ASOF,
    });

    await prisma.importCandidate.update({
      where: { id: candidate.id },
      data: { status: "accepted", linkedProgramSpendId: program.id },
    });
    created += 1;
  }

  return { created, rejected };
}
