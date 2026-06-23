import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { assessDisruption, rankAlternatives, type LiveFlightStatus, type AlternativeFlight } from "@/lib/flights/disruption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { flightNumber, airlineIata, origin, destination, scheduledDepart, scheduledArrive, nextFlight } = body;

  if (!flightNumber || !airlineIata) {
    return NextResponse.json({ error: "Missing flight info" }, { status: 400 });
  }

  const aviationKey = process.env.AVIATIONSTACK_API_KEY;
  const duffelToken = process.env.DUFFEL_ACCESS_TOKEN;

  // ── Step 1: Get live flight status from AviationStack ──────────────────────
  let liveStatus: LiveFlightStatus | null = null;

  if (aviationKey) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8_000);

      const url = `http://api.aviationstack.com/v1/flights?access_key=${aviationKey}&flight_iata=${encodeURIComponent(flightNumber)}&limit=1`;
      const res = await fetch(url, { signal: ctrl.signal });

      if (res.ok) {
        const data = await res.json();
        const flight = data?.data?.[0];
        if (flight) {
          const depDelay = flight.departure?.delay ?? 0;
          const arrDelay = flight.arrival?.delay ?? 0;
          liveStatus = {
            flightNumber,
            airlineIata,
            airlineName: flight.airline?.name ?? airlineIata,
            origin: flight.departure?.iata ?? origin,
            destination: flight.arrival?.iata ?? destination,
            scheduledDepart: flight.departure?.scheduled ?? scheduledDepart,
            estimatedDepart: flight.departure?.estimated ?? null,
            actualDepart: flight.departure?.actual ?? null,
            scheduledArrive: flight.arrival?.scheduled ?? scheduledArrive,
            estimatedArrive: flight.arrival?.estimated ?? null,
            actualArrive: flight.arrival?.actual ?? null,
            delayMinutes: Math.max(depDelay, arrDelay),
            status: flight.flight_status ?? "scheduled",
            gate: flight.departure?.gate ?? undefined,
            terminal: flight.departure?.terminal ?? undefined,
            baggageClaim: flight.arrival?.baggage ?? undefined,
          };
        }
      }
    } catch {
      // AviationStack unavailable — fall through to simulated
    }
  }

  // Fallback: use scheduled data
  if (!liveStatus) {
    liveStatus = {
      flightNumber,
      airlineIata,
      airlineName: airlineIata,
      origin,
      destination,
      scheduledDepart,
      estimatedDepart: null,
      actualDepart: null,
      scheduledArrive,
      estimatedArrive: null,
      actualArrive: null,
      delayMinutes: 0,
      status: "scheduled",
    };
  }

  // ── Step 2: Assess disruption ──────────────────────────────────────────────
  const assessment = assessDisruption(liveStatus, nextFlight);

  // ── Step 3: If action needed, search for alternatives via Duffel ──────────
  let alternatives: AlternativeFlight[] = [];

  if (assessment.actionRequired && duffelToken) {
    try {
      const departDate = new Date(scheduledDepart);
      const today = departDate.toISOString().split("T")[0]!;
      const tomorrow = new Date(departDate.getTime() + 86_400_000).toISOString().split("T")[0]!;

      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 20_000);

      // Search today + tomorrow
      const [todayRes, tmrwRes] = await Promise.all([
        searchDuffel(duffelToken, origin, destination, today, ctrl.signal),
        searchDuffel(duffelToken, origin, destination, tomorrow, ctrl.signal),
      ]);

      const allOffers = [...todayRes, ...tmrwRes];

      alternatives = rankAlternatives(allOffers.slice(0, 6).map((offer: Record<string, unknown>) => {
        const slices = offer.slices as Record<string, unknown>[];
        const outSlice = slices?.[0];
        const segs = outSlice?.segments as Record<string, unknown>[];
        const first = segs?.[0];
        const last = segs?.[segs.length - 1];
        const carrier = first?.operating_carrier as Record<string, unknown> | undefined;
        return {
          id: offer.id as string,
          airline: (carrier?.iata_code ?? airlineIata) as string,
          airlineName: (carrier?.name ?? "") as string,
          flightNumber: `${carrier?.iata_code ?? ""}${first?.operating_carrier_flight_number ?? ""}`,
          origin: ((first?.origin as Record<string, unknown>)?.iata_code ?? origin) as string,
          destination: ((last?.destination as Record<string, unknown>)?.iata_code ?? destination) as string,
          departs: first?.departing_at as string,
          arrives: last?.arriving_at as string,
          stops: Math.max(0, (segs?.length ?? 1) - 1),
          price: Number(offer.total_amount),
          currency: (offer.total_currency ?? "USD") as string,
          recommendation: "good" as const,
          reason: "",
        };
      }));
    } catch {
      // Duffel search failed — alternatives not available
    }
  }

  return NextResponse.json({
    status: liveStatus,
    assessment,
    alternatives,
    checkedAt: new Date().toISOString(),
  });
}

async function searchDuffel(token: string, origin: string, destination: string, date: string, signal: AbortSignal): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch("https://api.duffel.com/air/offer_requests", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Duffel-Version": "v2", "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          cabin_class: "economy",
          return_offers: true,
          max_connections: 1,
          slices: [{ origin, destination, departure_date: date }],
          passengers: [{ type: "adult" }],
        }
      }),
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data?.offers ?? []) as Record<string, unknown>[];
  } catch {
    return [];
  }
}
