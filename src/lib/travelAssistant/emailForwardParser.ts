import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";

const MODEL = "claude-sonnet-4-20250514";
const HIGH_CONFIDENCE_THRESHOLD = 70;
const LOW_CONFIDENCE_THRESHOLD = 40;
const MIN_READABLE_TEXT_LENGTH = 100;
const EMAIL_FORWARD_PARSER_SCOPE = "travelAssistant/emailForwardParser";

const FIELD_WEIGHTS = {
  type: 15,
  title: 15,
  provider: 10,
  confirmationCode: 20,
  localTime: 20,
  timezone: 8,
  location: 12,
} as const;

const TIMEZONE_ABBREVIATION_MAP: Record<string, string> = {
  UTC: "Etc/UTC",
  GMT: "Etc/UTC",
  EST: "America/New_York",
  EDT: "America/New_York",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MST: "America/Denver",
  MDT: "America/Denver",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
};

const RESERVATION_TYPE_KEYWORDS: Array<{ type: ForwardedReservationType; pattern: RegExp; confidence: number }> = [
  { type: "flight", pattern: /\b(flight|airline|boarding|terminal|gate)\b/iu, confidence: 0.78 },
  { type: "hotel", pattern: /\b(hotel|check-?in|check out|room|suite|stay)\b/iu, confidence: 0.78 },
  { type: "train", pattern: /\b(train|rail|amtrak|station|platform)\b/iu, confidence: 0.75 },
  { type: "ride", pattern: /\b(car rental|uber|lyft|taxi|ride|pickup|dropoff)\b/iu, confidence: 0.72 },
];

const REQUIRED_FIELDS: ForwardedReservationField[] = [
  "type",
  "title",
  "provider",
  "confirmationCode",
  "localTime",
  "location",
];

type ParserSource = "regex" | "ai";
type CandidateMap = Partial<Record<ForwardedReservationField, FieldCandidate>>;

interface FieldCandidate {
  value: string;
  confidence: number;
  source: ParserSource;
}

export type ForwardedReservationType = "flight" | "hotel" | "train" | "ride";
export type ForwardedReservationField =
  | "type"
  | "title"
  | "provider"
  | "confirmationCode"
  | "localTime"
  | "timezone"
  | "location"
  | "notes";
export type ForwardedParsingStatus = "auto-parsed" | "needs-review" | "needs-user-input";
export type ForwardedConfidenceLevel = "high" | "medium" | "low";

export interface ForwardedEmailAttachmentMeta {
  filename?: string | null;
  contentType?: string | null;
}

export interface ForwardedEmailParseInput {
  subject?: string | null;
  from?: string | null;
  text?: string | null;
  html?: string | null;
  attachments?: ForwardedEmailAttachmentMeta[] | null;
}

export interface ForwardedReservationDraft {
  type: ForwardedReservationType;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  notes: string;
}

export interface ForwardedEmailParseResult {
  draft: ForwardedReservationDraft;
  confidenceScore: number;
  confidenceLevel: ForwardedConfidenceLevel;
  parsingStatus: ForwardedParsingStatus;
  missingFields: ForwardedReservationField[];
  parserNotes: string[];
  originalEmailText: string;
  imageBasedEmail: boolean;
  hasPdfAttachment: boolean;
  usedAiFallback: boolean;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function stripHtml(input: string): string {
  return normalizeWhitespace(
    input
      .replace(/<style[\s\S]*?<\/style>/giu, " ")
      .replace(/<script[\s\S]*?<\/script>/giu, " ")
      .replace(/<[^>]+>/gu, " ")
      .replace(/&nbsp;/giu, " ")
      .replace(/&amp;/giu, "&")
      .replace(/&lt;/giu, "<")
      .replace(/&gt;/giu, ">")
      .replace(/&#39;/giu, "'")
      .replace(/&quot;/giu, '"'),
  );
}

function hasPdfAttachment(attachments: ForwardedEmailAttachmentMeta[] | null | undefined): boolean {
  if (!attachments || attachments.length === 0) {
    return false;
  }
  return attachments.some((attachment) => {
    const filename = attachment.filename?.toLowerCase() ?? "";
    const contentType = attachment.contentType?.toLowerCase() ?? "";
    return filename.endsWith(".pdf") || contentType.includes("pdf");
  });
}

function normalizeType(rawType: string): ForwardedReservationType | null {
  const value = rawType.trim().toLowerCase();
  if (value === "flight" || value === "hotel" || value === "train") {
    return value;
  }
  if (value === "ride" || value === "car" || value === "rental") {
    return "ride";
  }
  return null;
}

function formatProviderFromSender(sender: string): string {
  const domainMatch = sender.match(/@([a-z0-9.-]+\.[a-z]{2,})/iu);
  const host = domainMatch?.[1]?.split(".")[0] ?? "";
  if (!host) {
    return "";
  }
  return host
    .split("-")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function normalizeConfirmationCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/gu, "");
}

function parseTimeTo24Hour(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  const twelveHourMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/u.exec(trimmed);
  if (twelveHourMatch) {
    let hour = Number(twelveHourMatch[1]);
    const minute = Number(twelveHourMatch[2]);
    const meridiem = twelveHourMatch[3];
    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      return null;
    }
    if (meridiem === "PM" && hour < 12) {
      hour += 12;
    }
    if (meridiem === "AM" && hour === 12) {
      hour = 0;
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const twentyFourHourMatch = /^(\d{1,2}):(\d{2})$/u.exec(trimmed);
  if (!twentyFourHourMatch) {
    return null;
  }
  const hour = Number(twentyFourHourMatch[1]);
  const minute = Number(twentyFourHourMatch[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseDateCandidate(raw: string): string | null {
  const input = raw.trim();
  if (!input) {
    return null;
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(input);
  if (isoMatch) {
    const parsed = Date.parse(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`);
    return Number.isNaN(parsed) ? null : `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/u.exec(input);
  if (usMatch) {
    const month = Number(usMatch[1]);
    const day = Number(usMatch[2]);
    const year = Number(usMatch[3].length === 2 ? `20${usMatch[3]}` : usMatch[3]);
    const parsed = Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) {
    return null;
  }
  const parsedDate = new Date(parsed);
  return [
    parsedDate.getUTCFullYear(),
    String(parsedDate.getUTCMonth() + 1).padStart(2, "0"),
    String(parsedDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function resolveTimezone(text: string): string {
  const abbrMatch = text.match(/\b(UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/u);
  if (abbrMatch) {
    return TIMEZONE_ABBREVIATION_MAP[abbrMatch[1]] ?? "Etc/UTC";
  }
  const ianaMatch = text.match(/\b([A-Za-z]+\/[A-Za-z_]+)\b/u);
  if (ianaMatch) {
    return ianaMatch[1];
  }
  return "Etc/UTC";
}

function parseAiResponse(text: string): CandidateMap {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  const candidate = parsed as Record<string, unknown>;
  const output: CandidateMap = {};
  const setIfPresent = (field: ForwardedReservationField, value: unknown, confidence = 0.78): void => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = normalizeWhitespace(value);
    if (!trimmed) {
      return;
    }
    output[field] = {
      value: trimmed,
      confidence,
      source: "ai",
    };
  };

  if (typeof candidate.type === "string") {
    const normalized = normalizeType(candidate.type);
    if (normalized) {
      output.type = {
        value: normalized,
        confidence: 0.82,
        source: "ai",
      };
    }
  }
  setIfPresent("title", candidate.title, 0.8);
  setIfPresent("provider", candidate.provider, 0.76);
  setIfPresent("confirmationCode", candidate.confirmationCode, 0.8);
  setIfPresent("localTime", candidate.localTime, 0.74);
  setIfPresent("timezone", candidate.timezone, 0.72);
  setIfPresent("location", candidate.location, 0.76);
  setIfPresent("notes", candidate.notes, 0.68);
  return output;
}

function mergeCandidates(base: CandidateMap, incoming: CandidateMap): CandidateMap {
  const merged: CandidateMap = { ...base };
  const keys = Object.keys(incoming) as ForwardedReservationField[];
  for (const key of keys) {
    const next = incoming[key];
    if (!next || !next.value.trim()) {
      continue;
    }
    const existing = merged[key];
    if (!existing || next.confidence > existing.confidence) {
      merged[key] = next;
    }
  }
  return merged;
}

function scoreCandidates(candidates: CandidateMap): number {
  let score = 0;
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS) as Array<[keyof typeof FIELD_WEIGHTS, number]>) {
    const candidate = candidates[field];
    if (!candidate || !candidate.value.trim()) {
      continue;
    }
    score += weight * Math.min(1, Math.max(0, candidate.confidence));
  }
  return Math.round(score);
}

function confidenceLevel(score: number): ForwardedConfidenceLevel {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return "high";
  if (score >= LOW_CONFIDENCE_THRESHOLD) return "medium";
  return "low";
}

function statusFromScore(score: number): ForwardedParsingStatus {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return "auto-parsed";
  if (score >= LOW_CONFIDENCE_THRESHOLD) return "needs-review";
  return "needs-user-input";
}

function buildRegexCandidates(input: {
  text: string;
  subject: string;
  from: string;
  parserNotes: string[];
}): CandidateMap {
  const { text, subject, from, parserNotes } = input;
  const combined = `${subject}\n${text}`.trim();
  const candidates: CandidateMap = {};

  const flightNumberMatch = combined.match(/\b([A-Z]{2})\s?(\d{2,4})\b/u);
  if (flightNumberMatch) {
    const flightNumber = `${flightNumberMatch[1]} ${flightNumberMatch[2]}`;
    candidates.type = {
      value: "flight",
      confidence: 0.95,
      source: "regex",
    };
    candidates.title = {
      value: `${flightNumber} reservation`,
      confidence: 0.88,
      source: "regex",
    };
  } else {
    for (const keyword of RESERVATION_TYPE_KEYWORDS) {
      if (keyword.pattern.test(combined)) {
        candidates.type = {
          value: keyword.type,
          confidence: keyword.confidence,
          source: "regex",
        };
        break;
      }
    }
  }

  const routeMatch = combined.match(/\b([A-Z]{3})\s*(?:->|to|-)\s*([A-Z]{3})\b/u);
  if (routeMatch) {
    candidates.location = {
      value: `${routeMatch[1]} -> ${routeMatch[2]}`,
      confidence: 0.84,
      source: "regex",
    };
  } else {
    const airportMentions = [...combined.matchAll(/\b(?:from|to|via|airport|terminal)\s+([A-Z]{3})\b/gu)]
      .map((match) => match[1])
      .filter((value): value is string => typeof value === "string");
    if (airportMentions[0]) {
      candidates.location = {
        value: airportMentions[1] ? `${airportMentions[0]} -> ${airportMentions[1]}` : `${airportMentions[0]} airport`,
        confidence: 0.66,
        source: "regex",
      };
    }
  }

  const hotelNameMatch = combined.match(/(?:hotel|property|stay at|accommodation)\s*[:\-]?\s*([A-Z][A-Za-z0-9 '&.-]{2,60})/iu);
  if (hotelNameMatch?.[1]) {
    const hotelName = normalizeWhitespace(hotelNameMatch[1]);
    if (hotelName) {
      candidates.type = candidates.type ?? { value: "hotel", confidence: 0.8, source: "regex" };
      candidates.title = candidates.title ?? {
        value: hotelName,
        confidence: 0.78,
        source: "regex",
      };
      if (!candidates.provider) {
        candidates.provider = {
          value: hotelName.split(" ").slice(0, 2).join(" "),
          confidence: 0.6,
          source: "regex",
        };
      }
    }
  }

  const confirmationMatch = combined.match(
    /(?:confirmation(?:\s*(?:number|code))?|booking\s*(?:ref(?:erence)?|code)|record locator|pnr)[^A-Za-z0-9]{0,20}([A-Za-z0-9-]{5,8})/iu,
  );
  if (confirmationMatch?.[1]) {
    candidates.confirmationCode = {
      value: normalizeConfirmationCode(confirmationMatch[1]),
      confidence: 0.92,
      source: "regex",
    };
  } else {
    const fallbackConfirmationMatch = combined.match(/\b([A-Z0-9]{5,8})\b/u);
    if (fallbackConfirmationMatch?.[1]) {
      candidates.confirmationCode = {
        value: normalizeConfirmationCode(fallbackConfirmationMatch[1]),
        confidence: 0.56,
        source: "regex",
      };
    }
  }

  const dateMatch =
    combined.match(/\b(20\d{2}-\d{2}-\d{2})\b/u) ??
    combined.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/u) ??
    combined.match(
      /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?)\b/iu,
    );
  const parsedDate = parseDateCandidate(dateMatch?.[1] ?? "");
  const timeMatch = combined.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/iu) ?? combined.match(/\b(\d{1,2}:\d{2})\b/u);
  const parsedTime = parseTimeTo24Hour(timeMatch?.[1] ?? "");
  if (parsedDate && parsedTime) {
    candidates.localTime = {
      value: `${parsedDate} ${parsedTime}`,
      confidence: 0.9,
      source: "regex",
    };
  } else if (parsedDate) {
    candidates.localTime = {
      value: `${parsedDate} 12:00`,
      confidence: 0.6,
      source: "regex",
    };
    parserNotes.push("Time not found in email; defaulted to 12:00 local time for review.");
  }

  const timezone = resolveTimezone(combined);
  if (timezone) {
    candidates.timezone = {
      value: timezone,
      confidence: timezone === "Etc/UTC" ? 0.45 : 0.8,
      source: "regex",
    };
  }

  if (!candidates.provider) {
    const providerFromSender = formatProviderFromSender(from);
    if (providerFromSender) {
      candidates.provider = {
        value: providerFromSender,
        confidence: 0.7,
        source: "regex",
      };
    }
  }

  if (!candidates.title) {
    const normalizedSubject = normalizeWhitespace(subject);
    if (normalizedSubject) {
      candidates.title = {
        value: normalizedSubject,
        confidence: 0.72,
        source: "regex",
      };
    }
  }

  return candidates;
}

async function runAiFallback(rawEmailText: string): Promise<CandidateMap> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    logger.warn("AI fallback skipped: ANTHROPIC_API_KEY is missing.", {
      scope: EMAIL_FORWARD_PARSER_SCOPE,
      rawEmailText,
      rawEmailTextLength: rawEmailText.length,
    });
    return {};
  }

  const aiPrompt = [
    "Extract flight/hotel/train/car reservation details from this email and return as JSON.",
    "Use keys exactly: type, title, provider, confirmationCode, localTime, timezone, location, notes.",
    "If unknown, return empty string for that key.",
    "",
    rawEmailText,
  ].join("\n");
  logger.info("AI fallback request started.", {
    scope: EMAIL_FORWARD_PARSER_SCOPE,
    rawEmailText,
    rawEmailTextLength: rawEmailText.length,
    aiPrompt,
  });

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      temperature: 0,
      system:
        "Extract travel reservation details from forwarded email text. Return strict JSON only with keys: type, title, provider, confirmationCode, localTime, timezone, location, notes.",
      messages: [
        {
          role: "user",
          content: aiPrompt,
        },
      ],
    });
    const text = response.content
      .filter((block): block is Extract<(typeof response.content)[number], { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    logger.info("AI fallback raw response received.", {
      scope: EMAIL_FORWARD_PARSER_SCOPE,
      aiResponseRaw: text,
      aiResponseLength: text.length,
    });
    return parseAiResponse(text);
  } catch (error) {
    logger.error("AI fallback call failed.", {
      scope: EMAIL_FORWARD_PARSER_SCOPE,
      error: error instanceof Error ? error.message : "unknown",
      rawEmailText,
      aiPrompt,
    });
    return {};
  }
}

function buildDraft(candidates: CandidateMap, parserNotes: string[]): ForwardedReservationDraft {
  const typeValue = normalizeType(candidates.type?.value ?? "") ?? "ride";
  const notesSections = [
    normalizeWhitespace(candidates.notes?.value ?? ""),
    ...parserNotes.map((note) => normalizeWhitespace(note)).filter((note) => note.length > 0),
  ].filter((value) => value.length > 0);

  return {
    type: typeValue,
    title: normalizeWhitespace(candidates.title?.value ?? ""),
    provider: normalizeWhitespace(candidates.provider?.value ?? ""),
    localTime: normalizeWhitespace(candidates.localTime?.value ?? ""),
    timezone: normalizeWhitespace(candidates.timezone?.value ?? "Etc/UTC") || "Etc/UTC",
    location: normalizeWhitespace(candidates.location?.value ?? ""),
    confirmationCode: normalizeConfirmationCode(candidates.confirmationCode?.value ?? ""),
    notes: notesSections.join(" "),
  };
}

function missingFieldsFromDraft(draft: ForwardedReservationDraft): ForwardedReservationField[] {
  const missing = new Set<ForwardedReservationField>();
  for (const field of REQUIRED_FIELDS) {
    if (!draft[field].trim()) {
      missing.add(field);
    }
  }
  return [...missing];
}

function chooseBodyText(text: string, html: string): { parsedText: string; imageBasedEmail: boolean } {
  const normalizedText = normalizeWhitespace(text);
  if (normalizedText.length >= MIN_READABLE_TEXT_LENGTH) {
    return { parsedText: normalizedText, imageBasedEmail: false };
  }
  const strippedHtml = stripHtml(html);
  if (strippedHtml.length >= MIN_READABLE_TEXT_LENGTH) {
    return { parsedText: strippedHtml, imageBasedEmail: false };
  }
  return { parsedText: strippedHtml || normalizedText, imageBasedEmail: true };
}

export async function parseForwardedEmail(input: ForwardedEmailParseInput): Promise<ForwardedEmailParseResult> {
  const rawText = input.text ?? "";
  const rawHtml = input.html ?? "";
  logger.info("Email parser received raw input.", {
    scope: EMAIL_FORWARD_PARSER_SCOPE,
    rawSubject: input.subject ?? "",
    rawFrom: input.from ?? "",
    rawText,
    rawHtml,
    rawTextLength: rawText.length,
    rawHtmlLength: rawHtml.length,
  });

  const subject = normalizeWhitespace(input.subject ?? "");
  const from = normalizeWhitespace(input.from ?? "");
  const text = normalizeWhitespace(input.text ?? "");
  const html = input.html ?? "";
  const parserNotes: string[] = [];
  const { parsedText, imageBasedEmail } = chooseBodyText(text, html);
  const pdfAttached = hasPdfAttachment(input.attachments);

  if (pdfAttached) {
    parserNotes.push("This email has a PDF attachment that may contain your confirmation details");
    parserNotes.push("Check the attached PDF for your confirmation code");
  }

  let candidates = buildRegexCandidates({
    text: parsedText,
    subject,
    from,
    parserNotes,
  });
  let score = scoreCandidates(candidates);
  let usedAiFallback = false;

  if (!imageBasedEmail && score < HIGH_CONFIDENCE_THRESHOLD) {
    logger.info("Email parser attempting AI fallback.", {
      scope: EMAIL_FORWARD_PARSER_SCOPE,
      scoreBeforeAiFallback: score,
      threshold: HIGH_CONFIDENCE_THRESHOLD,
      parsedText,
      parsedTextLength: parsedText.length,
    });
    const aiCandidates = await runAiFallback(parsedText);
    if (Object.keys(aiCandidates).length > 0) {
      usedAiFallback = true;
      candidates = mergeCandidates(candidates, aiCandidates);
      score = scoreCandidates(candidates);
      parserNotes.push("Applied AI fallback extraction for low-confidence fields.");
      logger.info("AI fallback extracted fields.", {
        scope: EMAIL_FORWARD_PARSER_SCOPE,
        aiCandidates,
        scoreAfterAiFallback: score,
      });
    } else {
      logger.warn("AI fallback returned no extractable fields.", {
        scope: EMAIL_FORWARD_PARSER_SCOPE,
        scoreBeforeAiFallback: score,
      });
    }
  } else {
    logger.info("AI fallback not attempted.", {
      scope: EMAIL_FORWARD_PARSER_SCOPE,
      imageBasedEmail,
      scoreBeforeAiFallback: score,
      threshold: HIGH_CONFIDENCE_THRESHOLD,
    });
  }

  const draft = buildDraft(candidates, parserNotes);
  const missingFields = missingFieldsFromDraft(draft);
  const adjustedScore = Math.max(0, score - missingFields.length * 6);
  const boundedScore = imageBasedEmail ? Math.min(adjustedScore, 20) : adjustedScore;
  const parsingStatus = statusFromScore(boundedScore);
  const level = confidenceLevel(boundedScore);
  logger.info("Email parser extracted result.", {
    scope: EMAIL_FORWARD_PARSER_SCOPE,
    extractedCandidates: candidates,
    extractedDraft: draft,
    missingFields,
    parserNotes,
    confidenceScore: boundedScore,
    confidenceLevel: level,
    parsingStatus,
    usedAiFallback,
  });

  return {
    draft,
    confidenceScore: boundedScore,
    confidenceLevel: level,
    parsingStatus,
    missingFields,
    parserNotes,
    originalEmailText: parsedText || subject,
    imageBasedEmail,
    hasPdfAttachment: pdfAttached,
    usedAiFallback,
  };
}
