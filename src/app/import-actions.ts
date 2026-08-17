"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { loadActivePlan } from "@/lib/data";
import {
  confirmCandidates,
  persistImport,
  type CandidateDecision,
} from "@/lib/import-data";
import { detectCandidates, parseCsvTransactions, type SignConvention } from "@/import";

/** 5MB — generous for a statement export, bounded so we fail clearly instead of timing out. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type UploadResult =
  | { ok: true; uploadId: string; candidateCount: number; skippedRows: number; totalRows: number }
  | { ok: false; kind: "signAmbiguous" }
  | { ok: false; kind: "error"; message: string };

/**
 * Parse a CSV statement, detect recurring candidates, persist them for review.
 * Creates nothing in the plan — every candidate is a suggestion until confirmed.
 */
export async function uploadImportAction(formData: FormData): Promise<UploadResult> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const plan = await loadActivePlan(userId);
  if (!plan) redirect("/onboarding");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, kind: "error", message: "Choose a CSV file to upload." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      kind: "error",
      message: "That file is larger than 5MB. Try exporting a shorter date range.",
    };
  }
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".csv") && file.type !== "text/csv") {
    return {
      ok: false,
      kind: "error",
      message: "That looks like it isn't a CSV. Export your statement as CSV and try again.",
    };
  }

  const rawSign = String(formData.get("signConvention") ?? "");
  const signHint: SignConvention | undefined =
    rawSign === "negative-is-spend" || rawSign === "positive-is-spend" ? rawSign : undefined;

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, kind: "error", message: "We couldn't read that file." };
  }

  const parse = parseCsvTransactions(text, { signHint });
  if (parse.error) return { ok: false, kind: "error", message: parse.error };
  if (parse.signAmbiguous) return { ok: false, kind: "signAmbiguous" };
  if (parse.transactions.length === 0) {
    return {
      ok: false,
      kind: "error",
      message: "We didn't find any spending rows in that file.",
    };
  }

  const candidates = detectCandidates(parse.transactions);
  const uploadId = await persistImport({
    userId,
    planId: plan.planId,
    originalFilename: file.name,
    parse,
    candidates,
  });

  return {
    ok: true,
    uploadId,
    candidateCount: candidates.length,
    skippedRows: parse.skippedRows,
    totalRows: parse.totalRows,
  };
}

/**
 * Confirm a review: accepted candidates become Program Spends via the same
 * creation path the manual form uses.
 */
export async function confirmImportAction(
  uploadId: string,
  decisions: CandidateDecision[],
): Promise<{ created: number }> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const result = await confirmCandidates(userId, uploadId, decisions);

  revalidatePath("/");
  revalidatePath("/programs");
  return { created: result.created };
}
