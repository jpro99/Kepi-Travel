import { google, type gmail_v1 } from "googleapis";
import { logger } from "@/lib/logger";

const GMAIL_IMPORT_QUERY =
  "subject:(confirmation OR itinerary OR booking OR reservation OR ticket OR flight OR hotel OR train) newer_than:30d";

type ParsedReservationType = "flight" | "hotel" | "train" | "ride";
type ParsedReservationConfidence = "high" | "medium" | "low";

export interface ParsedReservation {
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: string;
  body: string;
  reservation: {
    type: ParsedReservationType;
    title: string;
    provider: string;
    localTime: string;
    timezone: string;
    location: string;
    confirmationCode: string;
    confidence: ParsedReservationConfidence;
    issues: string[];
  };
}

interface GmailApiClient {
  users: {
    messages: {
      list(args: {
        userId: string;
        q: string;
        maxResults: number;
      }): Promise<{ data: { messages?: Array<{ id?: string | null } | null> | null } }>;
      get(args: {
        userId: string;
        id: string;
        format: "full";
      }): Promise<{ data: gmail_v1.Schema$Message }>;
    };
  };
}

function sanitizeEnvNameSegment(value: string): string {
  return value.toUpperCase().replaceAll(/[^A-Z0-9]/g, "_");
}

function resolveUserToken(userId: string, key: "GMAIL_REFRESH_TOKEN" | "GMAIL_ACCESS_TOKEN"): string | null {
  const scopedKey = `${key}_${sanitizeEnvNameSegment(userId)}`;
  return process.env[scopedKey]?.trim() || process.env[key]?.trim() || null;
}

function resolveGmailOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GMAIL_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

function createAuthorizedGmailClient(userId: string): GmailApiClient | null {
  const oauthConfig = resolveGmailOAuthConfig();
  if (!oauthConfig) {
    return null;
  }

  const refreshToken = resolveUserToken(userId, "GMAIL_REFRESH_TOKEN");
  const accessToken = resolveUserToken(userId, "GMAIL_ACCESS_TOKEN");
  if (!refreshToken && !accessToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    oauthConfig.clientId,
    oauthConfig.clientSecret,
    oauthConfig.redirectUri,
  );
  oauth2Client.setCredentials({
    access_token: accessToken ?? undefined,
    refresh_token: refreshToken ?? undefined,
  });
  return google.gmail({
    version: "v1",
    auth: oauth2Client,
  });
}

function decodeBase64Url(input: string): string {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  return Buffer.from(`${normalized}${"=".repeat(padLength)}`, "base64").toString("utf8");
}

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | null {
  const candidate = headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
  return candidate?.trim() || null;
}

function extractPlainTextBody(part: gmail_v1.Schema$MessagePart | null | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  if (part.parts && part.parts.length > 0) {
    for (const child of part.parts) {
      const decoded = extractPlainTextBody(child);
      if (decoded.trim().length > 0) {
        return decoded;
      }
    }
  }
  if (part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  return "";
}

function parseProviderFromSender(sender: string): string {
  const rawEmail = sender.match(/<([^>]+)>/)?.[1] ?? sender;
  const domain = rawEmail.split("@")[1]?.toLowerCase() ?? "";
  if (!domain) return "Unknown provider";
  const provider = domain.split(".")[0] ?? "provider";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function extractReservationType(subject: string, body: string): ParsedReservationType {
  const text = `${subject}\n${body}`.toLowerCase();
  if (/(flight|airline|terminal|gate|boarding|pnr|record locator)/i.test(text)) {
    return "flight";
  }
  if (/(hotel|check-in|check in|check-out|check out|room|stay|property)/i.test(text)) {
    return "hotel";
  }
  if (/(train|rail|amtrak|platform|coach|station)/i.test(text)) {
    return "train";
  }
  if (/(car rental|car reservation|uber|lyft|pickup|driver|ride)/i.test(text)) {
    return "ride";
  }
  return "ride";
}

function extractConfirmationCode(subject: string, body: string): string {
  const text = `${subject}\n${body}`;
  const explicit =
    text.match(
      /(?:confirmation|booking|reservation|ticket|record locator|pnr)(?:\s+(?:code|number|no\.?|id|is)|\s*[:#-])\s*([A-Z0-9-]{4,18})/i,
    )?.[1] ??
    null;
  if (explicit) {
    return explicit.toUpperCase();
  }

  const candidates = text.toUpperCase().match(/\b[A-Z0-9-]{4,18}\b/g) ?? [];
  const fallback = candidates.find((token) => /[A-Z]/.test(token) && /\d/.test(token));
  return fallback ?? "UNKNOWN";
}

function extractLocation(type: ParsedReservationType, body: string): string {
  const locationMatch =
    body.match(/(?:from|to|at|location|station|terminal|hotel)[ \t]*[:\-][ \t]*([^\n]+)/i)?.[1] ??
    body.match(/(?:pickup|dropoff)[ \t]*[:\-][ \t]*([^\n]+)/i)?.[1];
  if (locationMatch) {
    return locationMatch.trim();
  }
  if (type === "flight") return "Confirm terminal";
  if (type === "hotel") return "Confirm property location";
  if (type === "train") return "Confirm station";
  return "Confirm pickup zone";
}

function formatDateTimeLocal(valueMs: number): string {
  const value = new Date(valueMs);
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  const hours = `${value.getUTCHours()}`.padStart(2, "0");
  const minutes = `${value.getUTCMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function extractDateIso(receivedAt: string, body: string): string {
  const byLabel =
    body.match(/(?:departure|arrival|check-in|check in|pickup|time)[ \t]*[:\-][ \t]*([^\n]+)/i)?.[1] ??
    body.match(/\b([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}[^,\n]*)/)?.[1];
  const parsed = Date.parse(byLabel ?? "");
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  const fallback = Date.parse(receivedAt);
  if (!Number.isNaN(fallback)) {
    return new Date(fallback).toISOString();
  }
  return new Date().toISOString();
}

function confidenceFromIssues(issues: string[]): ParsedReservationConfidence {
  if (issues.length === 0) return "high";
  if (issues.length <= 2) return "medium";
  return "low";
}

export function parseEmailToParsedReservation(args: {
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: string;
  body: string;
}): ParsedReservation {
  const type = extractReservationType(args.subject, args.body);
  const provider = parseProviderFromSender(args.sender);
  const confirmationCode = extractConfirmationCode(args.subject, args.body);
  const eventIso = extractDateIso(args.receivedAt, args.body);
  const issues: string[] = [];

  if (confirmationCode === "UNKNOWN") {
    issues.push("Confirmation code could not be confidently parsed.");
  }
  if (args.body.trim().length < 40) {
    issues.push("Email body appears short; validate key logistics fields.");
  }

  return {
    messageId: args.messageId,
    sender: args.sender,
    subject: args.subject,
    receivedAt: args.receivedAt,
    body: args.body,
    reservation: {
      type,
      title: args.subject.trim() || `${provider} reservation`,
      provider,
      localTime: formatDateTimeLocal(Date.parse(eventIso)),
      timezone: "UTC",
      location: extractLocation(type, args.body),
      confirmationCode,
      confidence: confidenceFromIssues(issues),
      issues,
    },
  };
}

async function readMessages(args: {
  gmailClient: GmailApiClient;
  maxResults: number;
}): Promise<ParsedReservation[]> {
  const listResponse = await args.gmailClient.users.messages.list({
    userId: "me",
    q: GMAIL_IMPORT_QUERY,
    maxResults: Math.max(1, Math.min(50, args.maxResults)),
  });

  const messageIds = (listResponse.data.messages ?? [])
    .map((message) => message?.id ?? null)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (messageIds.length === 0) {
    return [];
  }

  const parsedReservations: ParsedReservation[] = [];
  for (const id of messageIds) {
    const messageResponse = await args.gmailClient.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });
    const payload = messageResponse.data.payload ?? null;
    const sender = headerValue(payload?.headers, "From") ?? "unknown@mailer";
    const subject = headerValue(payload?.headers, "Subject") ?? "(No subject)";
    const receivedAt =
      headerValue(payload?.headers, "Date") ??
      (messageResponse.data.internalDate ? new Date(Number(messageResponse.data.internalDate)).toISOString() : new Date().toISOString());
    const body = extractPlainTextBody(payload);
    parsedReservations.push(
      parseEmailToParsedReservation({
        messageId: id,
        sender,
        subject,
        receivedAt,
        body,
      }),
    );
  }

  return parsedReservations;
}

export async function importGmailParsedReservations(args: {
  userId: string;
  maxResults?: number;
  gmailClient?: GmailApiClient;
}): Promise<ParsedReservation[]> {
  const maxResults = args.maxResults ?? 10;
  const gmailClient = args.gmailClient ?? createAuthorizedGmailClient(args.userId);
  if (!gmailClient) {
    logger.warn("Gmail import unavailable; OAuth credentials or user authorization is missing.", {
      scope: "travelAssistant/gmailImportProvider",
      userId: args.userId,
    });
    return [];
  }

  try {
    return await readMessages({
      gmailClient,
      maxResults,
    });
  } catch (error) {
    logger.warn("Gmail API import failed, returning empty reservation list.", {
      scope: "travelAssistant/gmailImportProvider",
      userId: args.userId,
      error,
    });
    return [];
  }
}
