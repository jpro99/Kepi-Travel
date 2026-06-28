import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUserId } from "@/lib/admin/adminAccess";
import {
  listRecentHotelBookingAnalytics,
  summarizeHotelBookingAnalytics,
} from "@/lib/hotels/hotelBookingAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!isAdminUserId(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const recent = await listRecentHotelBookingAnalytics(50);
    const summary = summarizeHotelBookingAnalytics(recent);
    return NextResponse.json({ summary, recent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load hotel booking analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
