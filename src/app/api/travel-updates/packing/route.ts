import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { generateSmartPackingList } from "@/lib/travelAssistant/packingListService";
import {
  PACKING_CATEGORIES,
  addCustomItem,
  getPackingCompletionPercent,
  getPackingList,
  removeItem,
  savePackingList,
  toggleItem,
} from "@/lib/travelAssistant/packingStore";
import { getActiveTrip, getTrip } from "@/lib/travelAssistant/tripStore";

const GenerateBodySchema = z.object({
  tripId: z.string().trim().min(1).optional(),
  forceRefresh: z.boolean().optional(),
});

const PatchBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("toggle"),
    tripId: z.string().trim().min(1).optional(),
    itemId: z.string().trim().min(1),
    checked: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("add-custom"),
    tripId: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1).max(200),
    category: z.enum(PACKING_CATEGORIES).optional(),
  }),
  z.object({
    action: z.literal("remove"),
    tripId: z.string().trim().min(1).optional(),
    itemId: z.string().trim().min(1),
  }),
]);

async function authorize(req: Request): Promise<
  | {
      ok: true;
      userId: string;
      requestId: string;
      headers: Headers;
      routeLogger: ReturnType<typeof logger.withContext>;
    }
  | { ok: false; response: NextResponse }
> {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/travel-updates/packing",
  });

  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/travel-updates/packing",
    requestId,
  });
  if (!rateLimit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many packing requests. Please retry shortly." },
        { status: 429, headers: rateLimit.headers },
      ),
    };
  }

  return {
    ok: true,
    userId,
    requestId,
    headers: rateLimit.headers,
    routeLogger,
  };
}

async function resolveTrip(userId: string, tripId?: string): Promise<Awaited<ReturnType<typeof getTrip>> | null> {
  if (tripId) {
    return getTrip(tripId, userId);
  }
  return getActiveTrip(userId);
}

export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(req.url);
  const tripId = url.searchParams.get("tripId")?.trim() || undefined;
  const trip = await resolveTrip(auth.userId, tripId);
  if (!trip) {
    return NextResponse.json(
      { error: "Trip not found for packing list." },
      { status: 404, headers: auth.headers },
    );
  }

  const list = await getPackingList(trip.id, auth.userId);
  return NextResponse.json(
    {
      tripId: trip.id,
      list,
      completionPercent: getPackingCompletionPercent(list),
    },
    { headers: auth.headers },
  );
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return auth.response;
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = GenerateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  const trip = await resolveTrip(auth.userId, parsed.data.tripId);
  if (!trip) {
    return NextResponse.json(
      { error: "Trip not found for packing generation." },
      { status: 404, headers: auth.headers },
    );
  }

  const startMs = Date.parse(`${trip.startDate}T00:00:00Z`);
  const endMs = Date.parse(`${trip.endDate}T23:59:59Z`);
  const durationDays =
    Number.isNaN(startMs) || Number.isNaN(endMs) ? 1 : Math.max(1, Math.round((endMs - startMs) / 86400000));

  const categories = await generateSmartPackingList({
    userId: auth.userId,
    tripId: trip.id,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    durationDays,
    reservationTypes: trip.reservations.map(
      (reservation) => `${reservation.type}:${reservation.title}:${reservation.provider}:${reservation.location}`,
    ),
    tripStage: trip.stage,
    activities: trip.reservations.map((reservation) => `${reservation.title} @ ${reservation.location}`).slice(0, 12),
    forceRefresh: parsed.data.forceRefresh,
  });

  const state = await savePackingList(trip.id, categories, auth.userId);
  return NextResponse.json(
    {
      tripId: trip.id,
      list: state,
      completionPercent: getPackingCompletionPercent(state),
    },
    { headers: auth.headers },
  );
}

export async function PATCH(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return auth.response;
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  const trip = await resolveTrip(auth.userId, parsed.data.tripId);
  if (!trip) {
    return NextResponse.json(
      { error: "Trip not found for packing update." },
      { status: 404, headers: auth.headers },
    );
  }

  let state = await getPackingList(trip.id, auth.userId);
  if (!state && parsed.data.action === "toggle") {
    return NextResponse.json(
      { error: "Packing list not found. Generate one first." },
      { status: 404, headers: auth.headers },
    );
  }

  if (parsed.data.action === "toggle") {
    state = await toggleItem(trip.id, parsed.data.itemId, auth.userId, parsed.data.checked);
  } else if (parsed.data.action === "add-custom") {
    state = await addCustomItem(trip.id, parsed.data.label, auth.userId, parsed.data.category);
  } else {
    state = await removeItem(trip.id, parsed.data.itemId, auth.userId);
  }

  return NextResponse.json(
    {
      tripId: trip.id,
      list: state,
      completionPercent: getPackingCompletionPercent(state),
    },
    { headers: auth.headers },
  );
}
