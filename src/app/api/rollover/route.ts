import { NextResponse } from "next/server";
import { runDailyRollover } from "@/lib/data";

// The daily rollover job (Epic 4). S2S accrual and recalculation are derived on
// read by the engine, so this endpoint recomputes each plan's state at the NY
// day boundary — the shape a scheduled cron (e.g. Vercel Cron) would hit once a
// day. Returns only aggregate counts, never per-user financial data.
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await runDailyRollover();
  return NextResponse.json({ ok: true, ...result });
}
