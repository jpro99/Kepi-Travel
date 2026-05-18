import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  DOCUMENT_TYPES,
  addDocument,
  deleteDocument,
  listDocuments,
} from "@/lib/travelAssistant/documentVault";
import { getActiveTrip } from "@/lib/travelAssistant/tripStore";

const DocumentTypeSchema = z.enum(DOCUMENT_TYPES);

const PostBodySchema = z.object({
  type: DocumentTypeSchema,
  name: z.string().trim().min(1).max(160),
  tripId: z.string().trim().min(1).max(120).optional(),
  reservationId: z.string().trim().min(1).max(120).optional(),
  expiresAt: z.string().trim().min(1).max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
  externalUrl: z.string().trim().url().max(1000).optional(),
});

const DeleteBodySchema = z.object({
  id: z.string().trim().min(1),
});

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
    route: "/api/documents",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized documents API request.");
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/documents",
    requestId,
  });
  if (!rateLimit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many document requests. Please retry shortly." },
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

export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(req.url);
  const requestedTripId = url.searchParams.get("tripId")?.trim();
  const activeTrip = requestedTripId ? null : await getActiveTrip(auth.userId);
  const tripId = requestedTripId || activeTrip?.id;
  const documents = await listDocuments(auth.userId, tripId ? { tripId } : undefined);
  return NextResponse.json(
    {
      tripId: tripId ?? null,
      documents,
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

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  const activeTrip = parsed.data.tripId ? null : await getActiveTrip(auth.userId);
  const resolvedTripId = parsed.data.tripId ?? activeTrip?.id;
  if (!resolvedTripId) {
    return NextResponse.json(
      { error: "No trip selected. Choose a trip before adding documents." },
      { status: 400, headers: auth.headers },
    );
  }

  const document = await addDocument(
    {
      ...parsed.data,
      tripId: resolvedTripId,
    },
    auth.userId,
  );

  return NextResponse.json(
    {
      document,
    },
    { headers: auth.headers },
  );
}

export async function DELETE(req: Request) {
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
  const parsed = DeleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  const removed = await deleteDocument(parsed.data.id, auth.userId);
  if (!removed) {
    return NextResponse.json({ error: "Document not found." }, { status: 404, headers: auth.headers });
  }
  return NextResponse.json({ ok: true }, { headers: auth.headers });
}
