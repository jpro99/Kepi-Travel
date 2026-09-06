import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import {
  buildTravelerCaptureRecord,
  validateTravelerCaptureInput,
} from "@/lib/airportNav/travelerCapture";
import {
  listTravelerCapturesForTrip,
  saveTravelerCaptureRecord,
} from "@/lib/airportNav/travelerCaptureStore";
import { enforceRateLimit } from "@/lib/rateLimit";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MapMarkSchema = z.object({
  lng: z.number().finite(),
  lat: z.number().finite(),
  accuracyM: z.number().finite().nullable().optional(),
  pinNote: z.string().trim().max(200).nullable().optional(),
});

const MAX_PHOTO_DATA_URL = 320_000;

const PostSchema = z.object({
  id: z.string().trim().max(80).optional(),
  tripId: z.string().trim().min(1).max(120),
  reservationId: z.string().trim().max(120).nullable().optional(),
  iata: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  gateString: z.string().trim().max(12).nullable().optional(),
  mapMark: MapMarkSchema.nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  capturedAt: z.string().trim().max(40).optional(),
  photoDataUrl: z
    .string()
    .trim()
    .max(MAX_PHOTO_DATA_URL)
    .refine((value) => !value || value.startsWith("data:image/"), "photo must be image data URL")
    .nullable()
    .optional(),
});

export async function GET(req: Request) {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tripId = new URL(req.url).searchParams.get("tripId")?.trim();
  if (!tripId) {
    return NextResponse.json({ error: "tripId is required" }, { status: 400 });
  }
  const captures = await listTravelerCapturesForTrip(tripId);
  return NextResponse.json({ captures });
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceRateLimit({
    policyName: "map-helper-report",
    identifier: userId,
    route: "/api/traveler-capture",
    requestId,
  });
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Too many captures — try again shortly." },
      { status: 429, headers: limited.headers },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid capture payload" }, { status: 400 });
  }

  const validated = validateTravelerCaptureInput(parsed.data);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 422 });
  }

  const record = buildTravelerCaptureRecord(
    {
      tripId: parsed.data.tripId,
      reservationId: parsed.data.reservationId,
      iata: parsed.data.iata,
      gateString: validated.gateString,
      note: validated.note,
      mapMark: validated.mapMark,
      capturedAt: parsed.data.capturedAt,
      photoDataUrl: parsed.data.photoDataUrl,
    },
    { syncStatus: "synced", hasLocalPhoto: Boolean(parsed.data.photoDataUrl?.trim()) },
  );
  if (parsed.data.id?.trim()) {
    record.id = parsed.data.id.trim();
  }

  const saved = await saveTravelerCaptureRecord(record);
  return NextResponse.json({ capture: saved }, { headers: limited.headers });
}
