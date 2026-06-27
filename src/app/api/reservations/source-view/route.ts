import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getResendClient } from "@/lib/email/resendClient";
import { getTrip } from "@/lib/travelAssistant/tripStore";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function renderEmailPage(input: {
  subject: string;
  bodyHtml: string;
  reservationTitle: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.subject || input.reservationTitle || "Confirmation email")}</title>
  <style>
    body { font-family: Georgia, serif; margin: 0; background: #f8fafc; color: #0f172a; }
    header { padding: 1rem 1.25rem; background: #0b1f3a; color: white; }
    header h1 { margin: 0; font-size: 1.1rem; }
    header p { margin: 0.35rem 0 0; font-size: 0.85rem; opacity: 0.85; }
    main { padding: 1rem; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 1rem; overflow-x: auto; }
    pre { white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; line-height: 1.5; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(input.reservationTitle || "Trip confirmation")}</h1>
    <p>${escapeHtml(input.subject || "Original forwarded email")}</p>
  </header>
  <main>
    <div class="card">${input.bodyHtml}</div>
  </main>
</body>
</html>`;
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const tripId = url.searchParams.get("tripId")?.trim() ?? "";
  const reservationId = url.searchParams.get("reservationId")?.trim() ?? "";
  if (!tripId || !reservationId) {
    return NextResponse.json({ error: "tripId and reservationId are required" }, { status: 400 });
  }

  const trip = await getTrip(tripId, userId);
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const reservation = trip.reservations.find((entry) => entry.id === reservationId) as
    | (SessionReservation & {
        sourceEmailId?: string;
        sourceEmailSubject?: string;
        originalEmailText?: string;
      })
    | undefined;
  if (!reservation) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  const subject =
    reservation.sourceEmailSubject?.trim() ||
    reservation.title?.trim() ||
    reservation.provider?.trim() ||
    "Confirmation email";

  const emailId = reservation.sourceEmailId?.trim();
  if (emailId) {
    const resend = getResendClient();
    if (resend) {
      try {
        const received = await resend.emails.receiving.get(emailId);
        if (received.data) {
          const htmlBody = received.data.html?.trim();
          const textBody = received.data.text?.trim() ?? reservation.originalEmailText?.trim() ?? "";
          const bodyHtml = htmlBody
            ? htmlBody
            : `<pre>${escapeHtml(textBody)}</pre>`;
          return new NextResponse(
            renderEmailPage({
              subject: received.data.subject?.trim() || subject,
              bodyHtml,
              reservationTitle: reservation.title || reservation.provider,
            }),
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      } catch {
        /* fall through to stored text */
      }
    }
  }

  const storedText = reservation.originalEmailText?.trim();
  if (!storedText) {
    return NextResponse.json({ error: "No source email stored for this reservation" }, { status: 404 });
  }

  return new NextResponse(
    renderEmailPage({
      subject,
      bodyHtml: `<pre>${escapeHtml(storedText)}</pre>`,
      reservationTitle: reservation.title || reservation.provider,
    }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
