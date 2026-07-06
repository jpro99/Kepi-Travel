import { EMAIL_FORWARD_PARSER_VERSION } from "@/lib/travelAssistant/mlReadiness/parserVersion";
import type {
  ParseCorrectionDraftSnapshot,
  ParseCorrectionOutcome,
  ParseCorrectionRecord,
} from "@/lib/travelAssistant/mlReadiness/types";
import { generateId } from "@/lib/utils/generateId";

const CORRECTION_FIELDS: Array<keyof ParseCorrectionDraftSnapshot> = [
  "type",
  "title",
  "provider",
  "localTime",
  "timezone",
  "location",
  "confirmationCode",
  "notes",
  "flightNumber",
  "flightAirline",
  "flightDate",
  "flightDepartureAirport",
  "flightArrivalAirport",
  "flightDepartureTime",
  "quotedPriceUsd",
  "quotedPointsMiles",
  "quotedMilesEarned",
  "pointsProgram",
];

function normalizeDraftValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value).trim();
}

export function snapshotParseDraft(draft: Record<string, unknown>): ParseCorrectionDraftSnapshot {
  const snapshot: ParseCorrectionDraftSnapshot = {};
  for (const field of CORRECTION_FIELDS) {
    const value = draft[field];
    if (value === undefined) continue;
    if (field === "quotedPriceUsd" || field === "quotedPointsMiles" || field === "quotedMilesEarned") {
      snapshot[field] = typeof value === "number" && Number.isFinite(value) ? value : null;
      continue;
    }
    snapshot[field] = normalizeDraftValue(value);
  }
  return snapshot;
}

export function diffParseDraftFields(
  parserGuess: ParseCorrectionDraftSnapshot,
  corrected: ParseCorrectionDraftSnapshot,
): string[] {
  const changed: string[] = [];
  for (const field of CORRECTION_FIELDS) {
    const left = parserGuess[field];
    const right = corrected[field];
    if (normalizeDraftValue(left) !== normalizeDraftValue(right)) {
      changed.push(field);
    }
  }
  return changed;
}

function truncateSourceSnippet(sourceText: string | undefined, maxLength = 4000): string {
  const normalized = (sourceText ?? "").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}\n…[truncated]`;
}

export interface BuildParseCorrectionInput {
  reviewItemId: string;
  parserGuess: Record<string, unknown>;
  corrected: Record<string, unknown>;
  gateReasons?: string[];
  sourceChannel?: string;
  sourceEmailSubject?: string;
  parseConfidenceScore?: number;
  parsingStatus?: string;
  originalEmailText?: string;
  parserVersion?: string;
  outcome?: ParseCorrectionOutcome;
}

export function buildParseCorrectionRecord(input: BuildParseCorrectionInput): ParseCorrectionRecord {
  const parserGuess = snapshotParseDraft(input.parserGuess);
  const corrected = snapshotParseDraft(input.corrected);
  const changedFields = diffParseDraftFields(parserGuess, corrected);
  const outcome: ParseCorrectionOutcome =
    input.outcome ?? (changedFields.length > 0 ? "edited-then-accepted" : "accepted");

  return {
    id: generateId(),
    recordedAt: new Date().toISOString(),
    parserVersion: input.parserVersion ?? EMAIL_FORWARD_PARSER_VERSION,
    reviewItemId: input.reviewItemId,
    sourceChannel: input.sourceChannel,
    sourceEmailSubject: input.sourceEmailSubject,
    parseConfidenceScore: input.parseConfidenceScore,
    parsingStatus: input.parsingStatus,
    gateReasons: input.gateReasons ?? [],
    parserGuess,
    corrected,
    changedFields,
    sourceTextSnippet: truncateSourceSnippet(input.originalEmailText),
    outcome,
  };
}
