import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTravelerGenome, saveTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface PassengerDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;      // YYYY-MM-DD
  passportNumber?: string;
  passportExpiry?: string;  // YYYY-MM-DD
  passportCountry?: string; // ISO 2-letter
  gender: "m" | "f";
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { offerId, passengers, flightSummary }: {
    offerId: string;
    passengers: PassengerDetails[];
    flightSummary: { from: string; to: string; departs: string; price: number; airline: string };
  } = body;

  if (!offerId || !passengers?.length) {
    return NextResponse.json({ error: "Missing offerId or passengers" }, { status: 400 });
  }

  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  // Build Duffel passengers array
  const duffelPassengers = passengers.map(p => ({
    type: "adult",
    title: p.gender === "f" ? "ms" : "mr",
    given_name: p.firstName.trim(),
    family_name: p.lastName.trim(),
    email: p.email.trim(),
    phone_number: p.phone.replace(/[^+\d]/g, ""),
    born_on: p.dateOfBirth,
    gender: p.gender,
    ...(p.passportNumber ? {
      identity_documents: [{
        type: "passport",
        document_number: p.passportNumber,
        expires_on: p.passportExpiry,
        issuing_country_code: p.passportCountry ?? "US",
      }]
    } : {}),
  }));

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 30_000);

    const res = await fetch("https://api.duffel.com/air/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          type: "instant",
          selected_offers: [offerId],
          passengers: duffelPassengers,
          payments: [{
            type: "balance",
            amount: String(flightSummary.price),
            currency: "USD",
          }],
          metadata: { kepi_user_id: userId },
        }
      }),
      signal: ctrl.signal,
    });

    const data = await res.json();

    if (!res.ok) {
      // Return helpful error from Duffel
      const errMsg = data?.errors?.[0]?.message ?? data?.errors?.[0]?.title ?? "Booking failed";
      return NextResponse.json({ error: errMsg, duffelErrors: data?.errors }, { status: 502 });
    }

    const order = data.data;
    const bookingRef = order?.booking_reference ?? order?.id;

    // Save passenger details to genome for future bookings (prefill)
    try {
      const genome = await getTravelerGenome(userId);
      const savedPassenger = passengers[0];
      await saveTravelerGenome({
        ...genome,
        savedPassengerDetails: {
          firstName: savedPassenger?.firstName ?? "",
          lastName: savedPassenger?.lastName ?? "",
          email: savedPassenger?.email ?? "",
          phone: savedPassenger?.phone ?? "",
          dateOfBirth: savedPassenger?.dateOfBirth ?? "",
          gender: savedPassenger?.gender ?? "m",
          passportNumber: savedPassenger?.passportNumber,
          passportExpiry: savedPassenger?.passportExpiry,
          passportCountry: savedPassenger?.passportCountry,
        },
        tripCount: (genome.tripCount ?? 0) + 1,
      }, userId);
    } catch { /* non-fatal */ }

    return NextResponse.json({
      success: true,
      bookingReference: bookingRef,
      orderId: order?.id,
      status: order?.payment_status?.paid_at ? "confirmed" : "awaiting_payment",
      documents: order?.documents ?? [],
      totalAmount: order?.total_amount,
      currency: order?.total_currency,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Booking failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
