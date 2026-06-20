import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const token = process.env.DUFFEL_ACCESS_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: "DUFFEL_ACCESS_TOKEN not set in Vercel env vars" }, { status: 500 });

  const steps: Record<string, unknown> = {
    tokenFound: true,
    tokenPrefix: token.slice(0, 12) + "...",
  };

  // STEP 1: POST offer request
  const t1Start = Date.now();
  let offerRequestId = "";
  let inlineOffers: unknown[] = [];
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch("https://api.duffel.com/air/offer_requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          cabin_class: "economy",
          return_offers: true,
          slices: [{ origin: "ONT", destination: "JFK", departure_date: "2026-09-01" }],
          passengers: [{ type: "adult" }],
          max_connections: 1,
        },
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    steps.postStatus = r.status;
    steps.postMs = Date.now() - t1Start;

    if (r.ok) {
      const payload = (await r.json()) as { data?: { id?: string; offers?: unknown[] } };
      offerRequestId = payload.data?.id ?? "";
      inlineOffers = payload.data?.offers ?? [];
      steps.offerRequestId = offerRequestId;
      steps.inlineOfferCount = inlineOffers.length;
      if (inlineOffers.length > 0) {
        const first = inlineOffers[0] as Record<string, unknown>;
        steps.cheapestOffer = {
          amount: first.total_amount,
          currency: first.total_currency,
          airline: (() => {
            const s = first.slices;
            if (!Array.isArray(s) || !s[0]) return null;
            const segs = (s[0] as Record<string, unknown>).segments;
            if (!Array.isArray(segs) || !segs[0]) return null;
            return (segs[0] as Record<string, unknown>).operating_carrier_code;
          })(),
        };
      }
    } else {
      const body = await r.text().catch(() => "");
      steps.postError = body.slice(0, 300);
    }
  } catch (err) {
    steps.postException = err instanceof Error ? err.message : String(err);
    steps.postMs = Date.now() - t1Start;
  }

  // STEP 2: GET offers if needed
  if (inlineOffers.length === 0 && offerRequestId) {
    await new Promise((r) => setTimeout(r, 2000));
    const t2Start = Date.now();
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 6_000);
      const r = await fetch(
        `https://api.duffel.com/air/offers?offer_request_id=${offerRequestId}&sort=total_amount&limit=5`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Duffel-Version": "v2",
            Accept: "application/json",
          },
          signal: ctrl.signal,
          cache: "no-store",
        }
      );
      steps.getStatus = r.status;
      steps.getMs = Date.now() - t2Start;
      if (r.ok) {
        const payload = (await r.json()) as { data?: unknown[] };
        steps.pollOfferCount = Array.isArray(payload.data) ? payload.data.length : 0;
      } else {
        steps.getError = await r.text().catch(() => "");
      }
    } catch (err) {
      steps.getException = err instanceof Error ? err.message : String(err);
    }
  }

  steps.totalMs = Date.now() - t1Start;
  return NextResponse.json(steps);
}
