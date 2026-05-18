import { randomUUID } from "node:crypto";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const DOCUMENTS_KEY = "docs";

export const DOCUMENT_TYPES = [
  "passport",
  "visa",
  "boarding pass",
  "hotel confirmation",
  "travel insurance waiver",
  "car rental agreement",
  "travel authorization",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface TravelDocument {
  id: string;
  type: DocumentType;
  name: string;
  tripId: string;
  reservationId?: string;
  uploadedAt: string;
  expiresAt?: string;
  notes: string;
  externalUrl?: string;
}

interface AddDocumentInput {
  type: DocumentType;
  name: string;
  tripId: string;
  reservationId?: string;
  expiresAt?: string;
  notes?: string;
  externalUrl?: string;
}

function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

function sanitizeDocument(raw: unknown): TravelDocument | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Partial<TravelDocument>;
  if (
    typeof candidate.id !== "string" ||
    !isDocumentType(candidate.type) ||
    typeof candidate.name !== "string" ||
    typeof candidate.tripId !== "string" ||
    typeof candidate.uploadedAt !== "string"
  ) {
    return null;
  }
  const expiresAt = typeof candidate.expiresAt === "string" && candidate.expiresAt.trim().length > 0
    ? candidate.expiresAt.trim()
    : undefined;
  const reservationId =
    typeof candidate.reservationId === "string" && candidate.reservationId.trim().length > 0
      ? candidate.reservationId.trim()
      : undefined;
  const notes = typeof candidate.notes === "string" ? candidate.notes : "";
  const externalUrl =
    typeof candidate.externalUrl === "string" && candidate.externalUrl.trim().length > 0
      ? candidate.externalUrl.trim()
      : undefined;
  return {
    id: candidate.id,
    type: candidate.type,
    name: candidate.name,
    tripId: candidate.tripId,
    reservationId,
    uploadedAt: candidate.uploadedAt,
    expiresAt,
    notes,
    externalUrl,
  };
}

async function readDocuments(userId?: string): Promise<TravelDocument[]> {
  const stored = await kvStoreGet<unknown>(DOCUMENTS_KEY, { userId });
  if (!Array.isArray(stored)) {
    return [];
  }
  return stored
    .map((entry) => sanitizeDocument(entry))
    .filter((entry): entry is TravelDocument => entry !== null)
    .sort((left, right) => Date.parse(right.uploadedAt) - Date.parse(left.uploadedAt));
}

async function writeDocuments(documents: TravelDocument[], userId?: string): Promise<void> {
  await kvStoreSet(DOCUMENTS_KEY, documents, { userId });
}

export async function addDocument(input: AddDocumentInput, userId?: string): Promise<TravelDocument> {
  const documents = await readDocuments(userId);
  const nextDocument: TravelDocument = {
    id: randomUUID(),
    type: input.type,
    name: input.name.trim(),
    tripId: input.tripId.trim(),
    reservationId: input.reservationId?.trim() || undefined,
    uploadedAt: new Date().toISOString(),
    expiresAt: input.expiresAt?.trim() || undefined,
    notes: input.notes?.trim() || "",
    externalUrl: input.externalUrl?.trim() || undefined,
  };
  await writeDocuments([nextDocument, ...documents], userId);
  return nextDocument;
}

export async function listDocuments(
  userId?: string,
  options?: { tripId?: string },
): Promise<TravelDocument[]> {
  const documents = await readDocuments(userId);
  const tripId = options?.tripId?.trim();
  if (!tripId) {
    return documents;
  }
  return documents.filter((document) => document.tripId === tripId);
}

export async function deleteDocument(id: string, userId?: string): Promise<boolean> {
  const documents = await readDocuments(userId);
  const nextDocuments = documents.filter((document) => document.id !== id);
  if (nextDocuments.length === documents.length) {
    return false;
  }
  await writeDocuments(nextDocuments, userId);
  return true;
}

export async function getExpiringDocuments(
  userId?: string,
  withinDays = 30,
  nowMs = Date.now(),
): Promise<TravelDocument[]> {
  const documents = await readDocuments(userId);
  const horizonMs = nowMs + Math.max(0, withinDays) * 24 * 60 * 60 * 1000;
  return documents
    .filter((document) => {
      if (!document.expiresAt) {
        return false;
      }
      const expiresAtMs = Date.parse(document.expiresAt);
      if (Number.isNaN(expiresAtMs)) {
        return false;
      }
      return expiresAtMs <= horizonMs;
    })
    .sort((left, right) => {
      const leftMs = left.expiresAt ? Date.parse(left.expiresAt) : Number.POSITIVE_INFINITY;
      const rightMs = right.expiresAt ? Date.parse(right.expiresAt) : Number.POSITIVE_INFINITY;
      return leftMs - rightMs;
    });
}
