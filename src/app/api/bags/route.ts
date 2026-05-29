import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { generateId } from "@/lib/utils/generateId";

/* ─── Schemas ─────────────────────────────────────────────────── */
const BagItemSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(200),
  checked: z.boolean(),
  critical: z.boolean(),
  weightKg: z.number().nonnegative().optional(),
});

const BagSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  type: z.enum(["carry-on", "checked", "personal"]),
  weightKg: z.number().nonnegative(),
  maxWeightKg: z.number().positive(),
  items: z.array(BagItemSchema).max(200),
  color: z.string().max(20),
});

const PostBodySchema = z.object({
  tripId: z.string().min(1).max(120),
  bags: z.array(BagSchema).max(20),
});

/* ─── Auth helper ─────────────────────────────────────────────── */
async function authorize(req: Request): Promise<
  | { ok: true; userId: string; requestId: string }
  | { ok: false; response: NextResponse }
> {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/bags",
    requestId,
  });
  if (!rateLimit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests. Please retry shortly." },
        { status: 429, headers: rateLimit.headers },
      ),
    };
  }
  return { ok: true, userId, requestId };
}

function bagKey(tripId: string) {
  return `bags:${tripId}`;
}

/* ─── GET ─────────────────────────────────────────────────────── */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const tripId = url.searchParams.get("tripId")?.trim();
  if (!tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  try {
    const state = await kvStoreGet<unknown>(bagKey(tripId));
    return NextResponse.json({ state: state ?? null });
  } catch {
    return NextResponse.json({ state: null });
  }
}

/* ─── POST ────────────────────────────────────────────────────── */
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const { tripId, bags } = parsed.data;
  const state = { bags, updatedAt: new Date().toISOString() };

  try {
    await kvStoreSet(bagKey(tripId), state);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
