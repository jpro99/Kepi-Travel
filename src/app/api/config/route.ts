import "server-only";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // This route is PUBLIC (see src/middleware.ts isPublicRoute) — only ever return the
  // domain-allowlisted browser key. MAPTILER_KEY / MAPTILER_API_KEY are server-only,
  // unrestricted, billable keys and must never be returned here (see src/app/api/maptiles/route.ts).
  const maptilerKey =
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
