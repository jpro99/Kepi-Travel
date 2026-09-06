/**
 * On-device gate/board extraction (@Generable / Vision) — null discipline.
 * Missing stays missing; never invent gates.
 */

export type GateVisionConfidence = "high" | "low";

export interface GateVisionExtractResult {
  gateString: string | null;
  confidence: GateVisionConfidence | null;
  source: "vision" | "generable" | null;
  rawText: string | null;
}

const GATE_TOKEN_RE = /\b(?:gate|gt\.?)\s*([A-Z]?\d{1,4}[A-Z]?)\b/iu;
const BARE_GATE_RE = /^[A-Z]?\d{1,4}[A-Z]?$/u;

function normalizeGateToken(value: string | null | undefined): string | null {
  const token = (value ?? "").trim().toUpperCase();
  if (!token || !BARE_GATE_RE.test(token)) return null;
  return token;
}

function extractGateFromText(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  const direct = normalizeGateToken(trimmed);
  if (direct) return direct;
  const match = trimmed.match(GATE_TOKEN_RE);
  return match ? normalizeGateToken(match[1]) : null;
}

/** Normalize Vision / @Generable output — null when ambiguous. */
export function normalizeVisionGateExtract(raw: {
  gateString?: string | null;
  text?: string | null;
  confidence?: number | null;
  source?: "vision" | "generable" | null;
}): GateVisionExtractResult {
  const rawText = (raw.text ?? "").trim() || null;
  const fromField = normalizeGateToken(raw.gateString);
  const extracted = fromField ?? extractGateFromText(rawText);

  if (!extracted) {
    return {
      gateString: null,
      confidence: null,
      source: null,
      rawText,
    };
  }

  const score = raw.confidence;
  let confidence: GateVisionConfidence | null = null;
  if (score != null && Number.isFinite(score)) {
    if (score >= 0.8) confidence = "high";
    else if (score >= 0.5) confidence = "low";
  }

  return {
    gateString: extracted,
    confidence,
    source: raw.source ?? "vision",
    rawText,
  };
}

/** Merge vision extract into capture input — never overwrites with invented gate. */
export function applyVisionExtractToCaptureInput<T extends { gateString?: string | null }>(
  input: T,
  vision: GateVisionExtractResult,
): T {
  if (!vision.gateString) return input;
  if (input.gateString?.trim()) return input;
  return { ...input, gateString: vision.gateString };
}
