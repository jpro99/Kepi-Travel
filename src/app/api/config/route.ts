import "server-only";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Return map key server-side — works regardless of NEXT_PUBLIC_ build-time baking
  // MapTiler keys are inherently public (appear in every tile request URL)
  const maptilerKey =
    process.env.NEXT_PUBLIC_MAPTILER_KEY ??
    process.env.MAPTILER_KEY ??
    "";

  return NextResponse.json({ maptilerKey });
}
