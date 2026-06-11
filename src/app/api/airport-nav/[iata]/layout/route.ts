import { NextResponse } from "next/server";
import { getAirportLayout, listSupportedAirports, normalizeAirportIata } from "@/lib/airportNav/layouts";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: { iata: string } | Promise<{ iata: string }> },
): Promise<Response> {
  const { iata: rawIata } = await Promise.resolve(context.params);
  const iata = normalizeAirportIata(rawIata);
  const model = getAirportLayout(iata);
  if (!model) {
    return NextResponse.json(
      {
        error: `Airport layout not available for ${iata.toUpperCase()}`,
        supported: listSupportedAirports(),
      },
      { status: 404 },
    );
  }

  return NextResponse.json(model, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      ETag: `"${model.iata}-${model.updatedAt}"`,
    },
  });
}
