import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const offerId = url.searchParams.get("offerId");
  if (!offerId) return NextResponse.json({ error: "Missing offerId" }, { status: 400 });

  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ seatMaps: [] });

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 15_000);

    const res = await fetch(
      `https://api.duffel.com/air/seat_maps?offer_id=${encodeURIComponent(offerId)}`,
      {
        headers: { "Authorization": `Bearer ${token}`, "Duffel-Version": "v2" },
        signal: ctrl.signal,
      }
    );

    if (!res.ok) return NextResponse.json({ seatMaps: [] });
    const data = await res.json();

    // Shape the seat map data for the UI
    const seatMaps = (data.data ?? []).map((sm: Record<string, unknown>) => ({
      segmentId: sm.segment_id,
      cabinClass: sm.cabin_class_marketing_name,
      cabins: (sm.cabins as Record<string, unknown>[])?.map(cabin => ({
        cabinClass: cabin.cabin_class,
        rows: (cabin.rows as Record<string, unknown>[])?.map(row => ({
          rowNumber: row.row_number,
          sections: (row.sections as Record<string, unknown>[])?.map(section => ({
            seats: (section.elements as Record<string, unknown>[])
              ?.filter(el => el.type === "seat")
              ?.map(seat => ({
                designator: seat.designator,         // e.g. "14A"
                available: seat.available_services?.length > 0 || seat.is_available,
                isExit: seat.disclosures?.some((d: Record<string, unknown>) => 
                  String(d.title ?? "").toLowerCase().includes("exit")) ?? false,
                isExtraLegroom: seat.disclosures?.some((d: Record<string, unknown>) => 
                  String(d.title ?? "").toLowerCase().includes("legroom")) ?? false,
                price: seat.available_services?.[0]?.total_amount
                  ? Number(seat.available_services[0].total_amount) : 0,
                currency: seat.available_services?.[0]?.total_currency ?? "USD",
              })) ?? [],
          })) ?? [],
        })) ?? [],
      })) ?? [],
    }));

    return NextResponse.json({ seatMaps });
  } catch {
    return NextResponse.json({ seatMaps: [] });
  }
}
