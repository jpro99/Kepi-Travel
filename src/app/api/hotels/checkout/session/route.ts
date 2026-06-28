import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { userHasMemberHotelPricing } from "@/lib/billing/memberHotelPricing";
import { getStripeClient } from "@/lib/billing/stripeClient";
import { guestTotalForPlan } from "@/lib/hotels/guestPricing";
import {
  createPendingHotelCheckoutId,
  savePendingHotelCheckout,
} from "@/lib/hotels/hotelBookingStore";
import { prebookLiteApiOffer } from "@/lib/providers/liteapi/bookHotel";
import { isLiteApiConfigured } from "@/lib/providers/liteapi/searchHotels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function resolveAppUrl(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim()?.replace(/^/, "https://") ||
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isLiteApiConfigured()) {
    return NextResponse.json({ error: "In-app hotel booking is not configured yet." }, { status: 503 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured for hotel checkout." }, { status: 503 });
  }

  const body = (await req.json()) as {
    offerId?: string;
    hotel?: {
      id?: string;
      name?: string;
      chainName?: string;
      address?: string;
      city?: string;
      checkIn?: string;
      checkOut?: string;
      guests?: number;
      rooms?: number;
      nights?: number;
      totalPrice?: number;
    };
    guest?: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    };
  };

  const offerId = body.offerId?.trim();
  const hotel = body.hotel;
  const guest = body.guest;
  if (!offerId || !hotel?.id || !hotel.name || !hotel.checkIn || !hotel.checkOut) {
    return NextResponse.json({ error: "Missing hotel offer or stay details." }, { status: 400 });
  }
  if (!guest?.firstName?.trim() || !guest.lastName?.trim() || !guest.email?.trim()) {
    return NextResponse.json({ error: "Guest first name, last name, and email are required." }, { status: 400 });
  }

  try {
    const isMember = await userHasMemberHotelPricing(userId);
    const prebook = await prebookLiteApiOffer(offerId);
    const guestTotalUsd = guestTotalForPlan(prebook.netTotalUsd, isMember);
    const pendingId = createPendingHotelCheckoutId();
    const appUrl = resolveAppUrl(req);

    await savePendingHotelCheckout({
      id: pendingId,
      userId,
      prebookId: prebook.prebookId,
      offerId,
      netTotalUsd: prebook.netTotalUsd,
      guestTotalUsd,
      isMemberRate: isMember,
      currency: prebook.currency,
      hotel: {
        id: hotel.id,
        name: hotel.name,
        chainName: hotel.chainName,
        address: hotel.address,
        city: hotel.city ?? hotel.name,
        checkIn: hotel.checkIn,
        checkOut: hotel.checkOut,
        guests: Number(hotel.guests ?? 2),
        rooms: Number(hotel.rooms ?? 1),
        nights: Number(hotel.nights ?? 1),
      },
      guest: {
        firstName: guest.firstName.trim(),
        lastName: guest.lastName.trim(),
        email: guest.email.trim(),
        phone: guest.phone?.trim(),
      },
      createdAt: new Date().toISOString(),
      status: "pending",
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(guestTotalUsd * 100),
            product_data: {
              name: hotel.name,
              description: `${hotel.checkIn} → ${hotel.checkOut}${isMember ? " · Member rate" : ""}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/travel-assistant?hotelBooking=success&pendingId=${encodeURIComponent(pendingId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/travel-assistant?hotelBooking=cancelled`,
      client_reference_id: userId,
      customer_email: guest.email.trim(),
      metadata: {
        kind: "hotel",
        userId,
        pendingId,
        offerId,
      },
    });

    if (!session.url) {
      return NextResponse.json({ error: "Could not start Stripe checkout." }, { status: 502 });
    }

    return NextResponse.json({
      checkoutUrl: session.url,
      pendingId,
      sessionId: session.id,
      guestTotalUsd,
      netTotalUsd: prebook.netTotalUsd,
      isMemberRate: isMember,
      memberSavingsUsd: isMember ? 0 : Math.max(0, guestTotalForPlan(prebook.netTotalUsd, false) - guestTotalUsd),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare checkout";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
