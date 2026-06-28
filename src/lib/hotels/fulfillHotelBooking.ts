import type Stripe from "stripe";
import { userHasMemberHotelPricing } from "@/lib/billing/memberHotelPricing";
import { getStripeClient } from "@/lib/billing/stripeClient";
import { guestTotalForPlan } from "@/lib/hotels/guestPricing";
import {
  getHotelCheckoutFulfillment,
  getPendingHotelCheckout,
  markHotelCheckoutFulfilled,
  updatePendingHotelCheckout,
} from "@/lib/hotels/hotelBookingStore";
import { bookLiteApiPrebook } from "@/lib/providers/liteapi/bookHotel";
import { createTrip, getActiveTrip, updateTrip } from "@/lib/travelAssistant/tripStore";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { generateId } from "@/lib/utils/generateId";

export async function fulfillHotelCheckout(input: {
  userId: string;
  pendingId: string;
  stripeSessionId: string;
}): Promise<{ bookingReference: string; alreadyFulfilled: boolean }> {
  const existing = await getHotelCheckoutFulfillment(input.stripeSessionId);
  if (existing?.bookingReference) {
    return { bookingReference: existing.bookingReference, alreadyFulfilled: true };
  }

  const pending = await getPendingHotelCheckout(input.userId, input.pendingId);
  if (!pending) {
    throw new Error("Checkout session expired — search again and retry.");
  }

  if (pending.status === "booked" && pending.bookingReference) {
    await markHotelCheckoutFulfilled(input.stripeSessionId, pending.bookingReference);
    return { bookingReference: pending.bookingReference, alreadyFulfilled: true };
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  const session = await stripe.checkout.sessions.retrieve(input.stripeSessionId);
  if (session.payment_status !== "paid") {
    throw new Error("Payment has not completed yet.");
  }
  if (session.metadata?.userId && session.metadata.userId !== input.userId) {
    throw new Error("Checkout session does not belong to this account.");
  }

  const isMember = await userHasMemberHotelPricing(input.userId);
  const expectedGuestTotal = guestTotalForPlan(pending.netTotalUsd, isMember);
  const paidUsd = (session.amount_total ?? 0) / 100;
  if (Math.abs(paidUsd - expectedGuestTotal) > 1.5) {
    throw new Error("Paid amount does not match the quoted hotel price.");
  }

  pending.status = "paid";
  pending.stripeSessionId = input.stripeSessionId;
  await updatePendingHotelCheckout(pending);

  const booked = await bookLiteApiPrebook({
    prebookId: pending.prebookId,
    clientReference: pending.id,
    holder: {
      firstName: pending.guest.firstName,
      lastName: pending.guest.lastName,
      email: pending.guest.email,
    },
    guests: [
      {
        firstName: pending.guest.firstName,
        lastName: pending.guest.lastName,
        email: pending.guest.email,
        occupancyNumber: 1,
      },
    ],
  });

  const bookingReference = booked.confirmationCode ?? booked.bookingId;
  pending.status = "booked";
  pending.bookingReference = bookingReference;
  await updatePendingHotelCheckout(pending);
  await markHotelCheckoutFulfilled(input.stripeSessionId, bookingReference);

  const reservation: SessionReservation = {
    id: generateId(),
    type: "hotel",
    title: pending.hotel.name,
    provider: pending.hotel.chainName ?? pending.hotel.name,
    localTime: pending.hotel.checkIn,
    timezone: "UTC",
    location: pending.hotel.city,
    confirmationCode: bookingReference,
    assignedTo: [],
    stage: "readiness",
    critical: true,
    confidence: "high",
    notes: `Booked via Kepi · ${pending.guestTotalUsd.toLocaleString()} ${pending.currency}`,
    source: "imported",
    checkOutDate: pending.hotel.checkOut,
  };

  const activeTrip = await getActiveTrip(input.userId);
  if (activeTrip) {
    await updateTrip(
      activeTrip.id,
      { reservations: [...activeTrip.reservations, reservation] },
      input.userId,
    );
  } else {
    await createTrip(
      {
        name: `Stay at ${pending.hotel.name}`,
        destination: pending.hotel.city,
        startDate: pending.hotel.checkIn,
        endDate: pending.hotel.checkOut,
        stage: "readiness",
        reservations: [reservation],
      },
      input.userId,
    );
  }

  return { bookingReference, alreadyFulfilled: false };
}

export async function fulfillHotelCheckoutFromStripeSession(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.metadata?.kind !== "hotel") return;
  const userId = session.client_reference_id ?? session.metadata?.userId;
  const pendingId = session.metadata?.pendingId;
  const sessionId = session.id;
  if (!userId || !pendingId || !sessionId) return;
  await fulfillHotelCheckout({ userId, pendingId, stripeSessionId: sessionId });
}
