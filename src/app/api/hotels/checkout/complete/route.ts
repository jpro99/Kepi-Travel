import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fulfillHotelCheckout } from "@/lib/hotels/fulfillHotelBooking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { pendingId?: string; sessionId?: string };
  const pendingId = body.pendingId?.trim();
  const sessionId = body.sessionId?.trim();
  if (!pendingId || !sessionId) {
    return NextResponse.json({ error: "Missing pendingId or sessionId" }, { status: 400 });
  }

  try {
    const result = await fulfillHotelCheckout({ userId, pendingId, stripeSessionId: sessionId });
    return NextResponse.json({
      success: true,
      bookingReference: result.bookingReference,
      alreadyFulfilled: result.alreadyFulfilled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Booking failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
