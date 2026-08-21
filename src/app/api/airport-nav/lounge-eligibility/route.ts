import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluateLoungeEligibility } from "@/lib/airportNav/loungeRules";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  iata: z.string().trim().min(3).max(4),
  airline: z.string().trim().optional(),
  credentials: z.object({
    tsaPreCheck: z.union([z.boolean(), z.literal("unknown")]).optional(),
    clear: z.union([z.boolean(), z.literal("unknown")]).optional(),
    globalEntry: z.union([z.boolean(), z.literal("unknown")]).optional(),
    paymentCards: z
      .array(z.object({ id: z.string(), product: z.string(), network: z.string() }))
      .optional(),
    loungeMemberships: z.array(z.string()).optional(),
    cardEnrollments: z
      .record(
        z.string(),
        z.object({
          priorityPassEnrolled: z.boolean().optional(),
          centurionDigitalReady: z.boolean().optional(),
          centurionGuestPassesUsedThisVisit: z.number().int().min(0).max(4).optional(),
          priorityPassNumber: z.string().max(40).optional(),
        }),
      )
      .optional(),
  }),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const results = evaluateLoungeEligibility(
    parsed.data.iata,
    {
      tsaPreCheck: parsed.data.credentials.tsaPreCheck ?? "unknown",
      clear: parsed.data.credentials.clear ?? "unknown",
      globalEntry: parsed.data.credentials.globalEntry ?? "unknown",
      paymentCards: parsed.data.credentials.paymentCards,
      loungeMemberships: parsed.data.credentials.loungeMemberships as never,
      cardEnrollments: parsed.data.credentials.cardEnrollments,
    },
    parsed.data.airline,
  ).sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0));

  return NextResponse.json({ lounges: results });
}
