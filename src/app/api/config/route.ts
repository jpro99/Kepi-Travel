import "server-only";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Try every possible env var name the user might have set
  const maptilerKey =
    process.env.MAPTILER_KEY ||         // server-only, no domain restrictions — best
    process.env.MAPTILER_API_KEY ||
    process.env.NEXT_PUBLIC_MAPTILER_KEY ||
    process.env.NEXT_PUBLIC_MAPLIBRE_KEY ||
    "";

  return NextResponse.json(
    { maptilerKey },
    {
      headers: {
        // Never cache — must always be fresh so key changes take effect immediately
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      },
    }
  );
}
