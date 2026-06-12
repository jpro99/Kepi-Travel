import { NextResponse } from "next/server";
import { getAirportLayout } from "@/lib/airportNav/layouts";

export const dynamic = "force-dynamic";

/** Legacy alias — prefer /api/airport-nav/[iata]/layout */
export async function GET(
  _request: Request,
  context: { params: Promise<{ iata: string }> },
): Promise<Response> {
  const { iata } = await context.params;
  const curated = getAirportLayout(iata);
  if (curated) {
    return NextResponse.json(curated);
  }

  return NextResponse.json(
    { error: `No layout for ${iata.toUpperCase()}. Use /api/airport-nav/${iata}/layout` },
    { status: 404 },
  );
}
