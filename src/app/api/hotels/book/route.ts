import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTravelerGenome, saveTravelerGenome } from "@/lib/traveler/travelerGenomeStore";
import { createTrip, getActiveTrip, updateTrip } from "@/lib/travelAssistant/tripStore";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { hotelId, guests, payment, hotelSummary } = body;

  if (!hotelId || !guests?.length) {
    return NextResponse.json({ error: "Missing hotelId or guests" }, { status: 400 });
  }

  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 30_000);

    // Step 1: Create a quote for the selected hotel
    const quoteRes = await fetch("https://api.duffel.com/stays/quotes", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: { id: hotelId } }),
      signal: ctrl.signal,
    });

    if (!quoteRes.ok) {
      return NextResponse.json({ error: "Hotel no longer available — please search again." }, { status: 502 });
    }

    const quoteData = await quoteRes.json();
    const quote = quoteData?.data;
    const quoteId = quote?.id;

    if (!quoteId) {
      return NextResponse.json({ error: "Could not get hotel quote." }, { status: 502 });
    }

    // Step 2: Create the booking
    const lead = guests[0];
    const bookingRes = await fetch("https://api.duffel.com/stays/bookings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          quote_id: quoteId,
          accommodation: {
            rooms: [{
              guests: guests.map((g: Record<string, string>) => ({
                given_name: g.firstName,
                family_name: g.lastName,
              })),
            }],
          },
          lead_guest: {
            given_name: lead.firstName,
            family_name: lead.lastName,
            email: lead.email,
            phone_number: lead.phone?.replace(/[^+\d]/g, ""),
          },
          payment: {
            type: "balance",
            amount: String(hotelSummary.totalPrice),
            currency: hotelSummary.currency ?? "USD",
          },
        }
      }),
      signal: ctrl.signal,
    });

    if (!bookingRes.ok) {
      const err = await bookingRes.json().catch(() => ({}));
      const errMsg = (err as Record<string, Record<string, string>[]>)?.errors?.[0]?.message ?? "Booking failed";
      return NextResponse.json({ error: errMsg }, { status: 502 });
    }

    const bookingData = await bookingRes.json();
    const booking = bookingData?.data;
    const bookingRef = booking?.booking_reference ?? booking?.id;

    // Save to genome
    try {
      const genome = await getTravelerGenome(userId);
      await saveTravelerGenome({
        ...genome,
        savedPassengerDetails: {
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          dateOfBirth: lead.dateOfBirth ?? "",
          gender: lead.gender ?? "m",
        },
        tripCount: (genome.tripCount ?? 0) + 1,
      }, userId);
    } catch { /* non-fatal */ }

    // Persist hotel booking as a trip reservation so /travel-assistant can display it
    try {
      const checkInDate = (hotelSummary?.checkIn ?? "").split("T")[0] || new Date().toISOString().split("T")[0];
      const newReservation: SessionReservation = {
        id: generateId(),
        type: "hotel",
        title: hotelSummary?.name ?? "Hotel stay",
        provider: hotelSummary?.name ?? "Hotel",
        localTime: hotelSummary?.checkIn ?? checkInDate,
        timezone: "America/New_York",
        location: hotelSummary?.city ?? hotelSummary?.to ?? "",
        confirmationCode: bookingRef,
        assignedTo: [],
        stage: "readiness",
        critical: true,
        confidence: "high",
        notes: "",
        source: "imported",
        checkOutDate: hotelSummary?.checkOut,
      };
      const activeTrip = await getActiveTrip(userId);
      if (activeTrip) {
        await updateTrip(activeTrip.id, {
          reservations: [...activeTrip.reservations, newReservation],
        }, userId);
      } else {
        await createTrip({
          name: hotelSummary?.name ? `Stay at ${hotelSummary.name}` : "Hotel trip",
          destination: hotelSummary?.city ?? hotelSummary?.to ?? "Unknown",
          startDate: checkInDate,
          endDate: (hotelSummary?.checkOut ?? "").split("T")[0] || checkInDate,
          stage: "readiness",
          reservations: [newReservation],
        }, userId);
      }
    } catch { /* non-fatal */ }

    return NextResponse.json({
      success: true,
      bookingReference: bookingRef,
      bookingId: booking?.id,
      status: "confirmed",
      totalAmount: booking?.total_amount ?? hotelSummary.totalPrice,
      currency: booking?.total_currency ?? hotelSummary.currency,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Booking failed" }, { status: 500 });
  }
}
