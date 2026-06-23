import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/flights/search?origin=LAX&destination=BRI&departDate=2026-09-01
// Returns cheapest price for ±3 days (price calendar)
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const origin = url.searchParams.get("origin") ?? "";
  const destination = url.searchParams.get("destination") ?? "";
  const departDate = url.searchParams.get("departDate") ?? "";

  if (!origin || !destination || !departDate) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ prices: {} });

  // Search ±3 days
  const base = new Date(departDate);
  const dates: string[] = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    dates.push(d.toISOString().split("T")[0]!);
  }

  const prices: Record<string, number> = {};
  await Promise.all(dates.map(async (date) => {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8_000);
      const res = await fetch("https://api.duffel.com/air/offer_requests", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Duffel-Version": "v2", "Content-Type": "application/json" },
        body: JSON.stringify({ data: { cabin_class: "economy", return_offers: true, max_connections: 2,
          slices: [{ origin: origin.toUpperCase(), destination: destination.toUpperCase(), departure_date: date }],
          passengers: [{ type: "adult" }] } }),
        signal: ctrl.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      const offers = data?.data?.offers ?? [];
      if (offers.length > 0) {
        prices[date] = Math.min(...offers.map((o: Record<string, unknown>) => Number(o.total_amount)));
      }
    } catch { /* skip */ }
  }));

  return NextResponse.json({ prices });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to search flights" }, { status: 401 });

  const body = await req.json();
  const { origin, destination, departDate, returnDate, passengers = 1, cabin = "economy" } = body;

  if (!origin || !destination || !departDate) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const slices = [{ origin: origin.toUpperCase(), destination: destination.toUpperCase(), departure_date: departDate }];
  if (returnDate) {
    slices.push({ origin: destination.toUpperCase(), destination: origin.toUpperCase(), departure_date: returnDate });
  }

  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 25_000);

  const res = await fetch("https://api.duffel.com/air/offer_requests", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Duffel-Version": "v2",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        cabin_class: cabin,
        return_offers: true,
        max_connections: 2,
        slices,
        passengers: Array.from({ length: Number(passengers) }, () => ({ type: "adult" })),
      }
    }),
    signal: ctrl.signal,
  }).catch(() => null);

  if (!res || !res.ok) {
    return NextResponse.json({ error: "Search failed — try again" }, { status: 502 });
  }

  const data = await res.json();
  const offers: Record<string, unknown>[] = (data?.data?.offers ?? []) as Record<string, unknown>[];

  const flights = offers.slice(0, 8).map((offer) => {
    const sliceList = offer.slices as Record<string, unknown>[];
    const out = sliceList?.[0];
    const segs = out?.segments as Record<string, unknown>[];
    const first = segs?.[0];
    const last = segs?.[segs.length - 1];
    const carrier = first?.operating_carrier as Record<string, unknown> | undefined;
    const ret = sliceList?.[1];
    const retSegs = (ret?.segments as Record<string, unknown>[]) ?? [];

    return {
      id: offer.id as string,
      price: Number(offer.total_amount),
      currency: (offer.total_currency ?? "USD") as string,
      airline: (carrier?.iata_code ?? "??") as string,
      airlineName: (carrier?.name ?? "") as string,
      departs: first?.departing_at as string,
      arrives: last?.arriving_at as string,
      fromIata: ((first?.origin as Record<string, unknown>)?.iata_code ?? origin) as string,
      toIata: ((last?.destination as Record<string, unknown>)?.iata_code ?? destination) as string,
      stops: Math.max(0, (segs?.length ?? 1) - 1),
      duration: out?.duration as string,
      returnFlight: ret ? {
        departs: retSegs[0]?.departing_at as string,
        arrives: retSegs[retSegs.length - 1]?.arriving_at as string,
        stops: Math.max(0, retSegs.length - 1),
        duration: ret.duration as string,
      } : null,
    };
  });

  return NextResponse.json({ flights, total: offers.length });
}
