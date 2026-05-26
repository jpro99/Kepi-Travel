import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { parseForwardedEmail } from "@/lib/travelAssistant/emailForwardParser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { emailText } = await request.json() as { emailText: string };

  const result = await parseForwardedEmail({
    subject: "Alaska Airlines Reservation MFKRJF",
    from: "noreply@alaskaair.com",
    text: emailText,
    html: "",
  });

  return NextResponse.json({
    totalDrafts: result.drafts.length,
    usedAiFallback: result.usedAiFallback,
    confidenceScore: result.confidenceScore,
    drafts: result.drafts.map((d) => ({
      type: d.type,
      provider: d.provider,
      flightNumber: d.flightNumber,
      localTime: d.localTime,
      departureAirport: (d as Record<string, unknown>).departureAirport ?? "",
      arrivalAirport: (d as Record<string, unknown>).arrivalAirport ?? "",
      confirmationCode: d.confirmationCode,
    })),
  });
}
