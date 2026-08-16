import { NextResponse } from "next/server";
import { seedDemoData } from "@/lib/demo-seed";

export const dynamic = "force-dynamic";

/**
 * Seed (or reset) the demo personas. Secret-gated: requires `?key=` (or an
 * `x-seed-key` header) matching SEED_SECRET. Disabled if SEED_SECRET is unset.
 * Idempotent — re-hitting resets the demo users to a clean scenario.
 */
async function handle(request: Request) {
  const expected = process.env.SEED_SECRET;
  const provided =
    new URL(request.url).searchParams.get("key") ??
    request.headers.get("x-seed-key");

  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const result = await seedDemoData();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return handle(request);
}
