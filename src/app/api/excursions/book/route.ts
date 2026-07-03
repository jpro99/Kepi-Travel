import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import {
  getExcursionById,
  reservationTypeForExcursion,
} from "@/lib/excursions/catalog";
import { EXCURSION_NOTE_PREFIX } from "@/lib/excursions/types";
import { assertTripEditAccess } from "@/lib/travelAssistant/tripCollaborationStore";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { createTrip, getActiveTrip, getTrip, updateTrip } from "@/lib/travelAssistant/tripStore";
import { generateId } from "@/lib/utils/generateId";

export const dynamic = "force-dynamic";

const BookSchema = z.object({
  excursionId: z.string().trim().min(1),
  tripId: z.string().trim().optional(),
  date: z.string().trim().min(1),
  time: z.string().trim().optional(),
  guests: z.number().int().min(1).max(20),
  guest: z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: z.string().email(),
  }),
});

function buildBookingReference(): string {
  const suffix = generateId().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `KEPI-XP-${suffix}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  }

  const excursion = getExcursionById(parsed.data.excursionId);
  if (!excursion) {
    return NextResponse.json({ error: "Experience not found" }, { status: 404 });
  }

  if (parsed.data.guests > excursion.maxGuests) {
    return NextResponse.json(
      { error: `This experience allows up to ${excursion.maxGuests} guests.` },
      { status: 422 },
    );
  }

  const bookingReference = buildBookingReference();
  const timePart = parsed.data.time?.trim() || "10:00";
  const localTime = `${parsed.data.date}T${timePart.length === 5 ? `${timePart}:00` : timePart}`;
  const totalPrice = excursion.priceUsd * parsed.data.guests;

  const reservation: SessionReservation = {
    id: generateId(),
    type: reservationTypeForExcursion(excursion.category),
    title: excursion.title,
    provider: excursion.provider,
    localTime,
    timezone: "Etc/UTC",
    location: excursion.meetingPoint,
    confirmationCode: bookingReference,
    assignedTo: [],
    stage: "readiness",
    critical: false,
    confidence: "high",
    notes: `${EXCURSION_NOTE_PREFIX}${excursion.category} · ${excursion.id} · ${parsed.data.guests} guest${parsed.data.guests === 1 ? "" : "s"}`,
    source: "imported",
    quotedPriceUsd: totalPrice,
  };

  try {
    let targetTripId = parsed.data.tripId?.trim() ?? "";
    let ownerUserId = userId;

    if (targetTripId) {
      const grant = await assertTripEditAccess(userId, targetTripId);
      ownerUserId = grant.ownerUserId;
    } else {
      const activeTrip = await getActiveTrip(userId);
      if (activeTrip) {
        targetTripId = activeTrip.id;
      }
    }

    if (targetTripId) {
      const trip = await getTrip(targetTripId, ownerUserId);
      if (!trip) {
        return NextResponse.json({ error: "Trip not found" }, { status: 404 });
      }
      const updated = await updateTrip(
        targetTripId,
        { reservations: [...trip.reservations, reservation] },
        ownerUserId,
      );
      if (!updated) {
        return NextResponse.json({ error: "Could not save to trip" }, { status: 500 });
      }
    } else {
      await createTrip(
        {
          name: `${excursion.city} experiences`,
          destination: excursion.city,
          startDate: parsed.data.date,
          endDate: parsed.data.date,
          stage: "readiness",
          reservations: [reservation],
        },
        userId,
      );
    }

    return NextResponse.json({
      success: true,
      bookingReference,
      reservation,
      excursion,
      totalPrice,
      currency: excursion.currency,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Booking failed";
    const status = message.includes("View-only") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
