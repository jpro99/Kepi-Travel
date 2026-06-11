import { NextResponse } from "next/server";
import { z } from "zod";
import { routeLocalVoiceIntent } from "@/lib/airportNav/intentRouter";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  utterance: z.string().trim().min(1).max(500),
  context: z
    .object({
      phase: z.string().optional(),
      iata: z.string().optional(),
    })
    .optional(),
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

  const local = routeLocalVoiceIntent(parsed.data.utterance);
  if (local) {
    return NextResponse.json({ intent: local });
  }

  return NextResponse.json({
    intent: {
      intent: "fallthrough_concierge",
      slots: { utterance: parsed.data.utterance },
      confidence: 0.4,
      source: "local_router",
      spokenResponse: "I heard you — concierge routing will answer when online.",
    },
  });
}
