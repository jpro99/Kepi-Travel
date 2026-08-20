import Anthropic from "@anthropic-ai/sdk";
import {
  confirmationKindUsesTextExtraction,
  extractConfirmationPlainText,
  resolveConfirmationScanKind,
  type ConfirmationScanKind,
} from "@/lib/travelAssistant/confirmationDocumentText";
import { validateConfirmationPlainText } from "@/lib/travelAssistant/confirmationDocumentValidation";
import { mergeConfirmationDrafts } from "@/lib/travelAssistant/confirmationDraftMerge";
import {
  parseScannedReservationsJson,
  type ScannedReservationDraft,
} from "@/lib/travelAssistant/scannedReservationDraft";

function isHeicBuffer(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  const head = bytes.subarray(4, 12).toString("ascii").toLowerCase();
  return head.startsWith("ftyp") && (head.includes("heic") || head.includes("heif") || head.includes("mif1"));
}

const SCAN_SYSTEM_PROMPT = [
  "You extract travel reservations from confirmation documents (PDF e-tickets, HTML emails, boarding passes, hotel vouchers, rail tickets).",
  "Return ONLY strict JSON — no explanation text.",
  "Shape:",
  '{ "reservations": [ { "type": "", "title": "", "provider": "", "confirmationCode": "", "localTime": "", "checkOutDate": "", "timezone": "", "location": "", "notes": "", "flightNumber": "", "departureAirport": "", "arrivalAirport": "", "roomType": "", "cashUsd": 0, "pointsMiles": 0, "pointsProgram": "" } ] }',
  "CRITICAL — MULTI-LEG ITINERARIES: Scan the ENTIRE document for EVERY flight segment and EVERY hotel.",
  "A single document may contain 5+ flights (e.g. ONT→SEA→FCO→BRI and later MUC→CGK for Indonesia) — return ONE object per segment in reservations[].",
  "Never merge legs. Each flight needs its own flightNumber, departureAirport, arrivalAirport, and localTime (that leg's scheduled DEPARTURE).",
  "Many documents use ONE confirmation/PNR code for all legs — still emit separate reservations[] objects per leg.",
  "For hotels on the same document, add a separate reservations[] object with type=hotel, localTime=check-in (YYYY-MM-DD HH:mm), checkOutDate=YYYY-MM-DD.",
  "type values: flight, hotel, train, ride, dinner.",
  "localTime for flights = scheduled gate departure in YYYY-MM-DD HH:mm 24-hour. NOT boarding time, purchase date, or email/print date.",
  "If year is missing on one leg but visible on another leg in the same document, reuse that year.",
  "If year is still missing but month/day are clearly a future trip date, infer the year from context on the document.",
  "flightNumber = 2-letter IATA airline code + number (AS832, AZ1234, GA123). Never credit-card fragments.",
  "departureAirport / arrivalAirport = IATA codes (BRI, FCO, CGK, DPS, SIN, MUC, SEA, ONT). Bali=DPS, Jakarta=CGK.",
  "timezone = IANA timezone of the DEPARTURE city (Europe/Rome, Asia/Jakarta, America/Los_Angeles).",
  "For award tickets paid purely with miles: fill pointsMiles + pointsProgram, and set cashUsd to the cash taxes/fees actually charged (0 only when no cash was charged).",
  "When cash is paid, set cashUsd to the TOTAL in US dollars as a number (no currency symbol). Examples: $499 USD → 499, 499usd → 499, Total 1,284.50 USD → 1285.",
  "TICKET VALUE vs AMOUNT DUE: exchanges and reissues show 'Total charges for air travel: USD $0.00' because nothing more is owed today. That is NOT the ticket price.",
  "When 'New Ticket Value', 'Ticket Value', or 'Summary of airfare charges' shows an amount, set cashUsd to that ticket value — never to the $0.00 balance due.",
  "If several passengers each list the same ticket value, cashUsd = the sum across passengers for that confirmation.",
  "Only extract fields explicitly visible. Do not invent confirmation codes or airports.",
].join("\n");

function imageMediaType(file: File): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/gif" ||
    file.type === "image/webp"
  ) {
    return file.type;
  }
  return "image/jpeg";
}

function extractionPrompt(kind: ConfirmationScanKind): string {
  if (kind === "html") {
    return "Extract every flight segment and every hotel from this HTML travel confirmation (email or webpage). Return all of them in reservations[].";
  }
  if (kind === "text") {
    return "Extract every flight segment and every hotel from this plain-text travel confirmation. Return all of them in reservations[].";
  }
  if (kind === "pdf") {
    return "Extract every flight segment and every hotel from this PDF. Return all of them in reservations[].";
  }
  return "Extract every reservation visible on this ticket image. Return all in reservations[].";
}

async function scanWithModel(args: {
  client: Anthropic;
  kind: ConfirmationScanKind;
  file: File;
  fileBase64: string;
  plainText: string;
}): Promise<string> {
  const userTextParts = [extractionPrompt(args.kind)];

  if (args.plainText.length >= 80) {
    userTextParts.push(
      "Plain text extracted from the document (use this to ensure you capture every leg, including later pages):\n\n" +
        args.plainText.slice(0, 120_000),
    );
  }

  if (args.kind === "image") {
    const scanResponse = await args.client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 12_000,
      temperature: 0,
      system: SCAN_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageMediaType(args.file),
                data: args.fileBase64,
              },
            },
            {
              type: "text",
              text: userTextParts.join("\n\n"),
            },
          ],
        },
      ],
    });
    return scanResponse.content
      .filter((block): block is Extract<(typeof scanResponse.content)[number], { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }

  if (args.kind === "pdf") {
    const scanResponse = await args.client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 12_000,
      temperature: 0,
      system: SCAN_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: args.fileBase64,
              },
            },
            {
              type: "text",
              text: userTextParts.join("\n\n"),
            },
          ],
        },
      ],
    });
    return scanResponse.content
      .filter((block): block is Extract<(typeof scanResponse.content)[number], { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }

  if (args.plainText.length < 40) {
    throw new Error("Document did not contain enough readable text to parse.");
  }

  const scanResponse = await args.client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 12_000,
    temperature: 0,
    system: SCAN_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userTextParts.join("\n\n"),
          },
        ],
      },
    ],
  });
  return scanResponse.content
    .filter((block): block is Extract<(typeof scanResponse.content)[number], { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function finalizeDrafts(aiDrafts: ScannedReservationDraft[], plainText: string, kind: ConfirmationScanKind): ScannedReservationDraft[] {
  if (confirmationKindUsesTextExtraction(kind) && plainText.length >= 80) {
    return mergeConfirmationDrafts(aiDrafts, plainText);
  }
  return aiDrafts;
}

function regexDraftsFromPlainText(plainText: string, kind: ConfirmationScanKind): ScannedReservationDraft[] {
  if (!confirmationKindUsesTextExtraction(kind) || plainText.length < 80) {
    return [];
  }
  return mergeConfirmationDrafts([], plainText);
}

export interface ConfirmationScanExtraction {
  drafts: ScannedReservationDraft[];
  /** Full plain text of the document — the pricing source of truth (G42). */
  documentText: string;
}

export async function extractConfirmationDocumentWithText(
  file: File,
  apiKey: string,
): Promise<ConfirmationScanExtraction> {
  const fileBytes = Buffer.from(await file.arrayBuffer());
  const kind = resolveConfirmationScanKind(file, fileBytes);
  const documentText = confirmationKindUsesTextExtraction(kind)
    ? await extractConfirmationPlainText(fileBytes, kind)
    : "";
  const drafts = await extractConfirmationDocument(file, apiKey);
  return { drafts, documentText };
}

export async function extractConfirmationDocument(
  file: File,
  apiKey: string,
): Promise<ScannedReservationDraft[]> {
  const fileBytes = Buffer.from(await file.arrayBuffer());
  const kind = resolveConfirmationScanKind(file, fileBytes);
  if (kind === "image" && isHeicBuffer(fileBytes)) {
    throw new Error(
      "HEIC photos are not supported yet. Change camera format to JPEG, or take a screenshot of your confirmation.",
    );
  }
  const fileBase64 = fileBytes.toString("base64");
  const plainText = confirmationKindUsesTextExtraction(kind)
    ? await extractConfirmationPlainText(fileBytes, kind)
    : "";

  if (confirmationKindUsesTextExtraction(kind)) {
    const validation = validateConfirmationPlainText(plainText);
    if (!validation.ok) {
      throw new Error(validation.message);
    }
  }

  const regexDrafts = regexDraftsFromPlainText(plainText, kind);
  const trimmedApiKey = apiKey.trim();

  if (!trimmedApiKey) {
    if (kind === "image") {
      throw new Error("Photo import needs AI vision — ticket scan is temporarily unavailable.");
    }
    if (regexDrafts.length > 0) {
      return regexDrafts;
    }
    throw new Error("Could not read any reservations from this file. Try a PDF export from your airline email.");
  }

  try {
    const client = new Anthropic({ apiKey: trimmedApiKey });
    const modelText = await scanWithModel({
      client,
      kind,
      file,
      fileBase64,
      plainText,
    });
    const aiDrafts = parseScannedReservationsJson(modelText);
    const drafts = finalizeDrafts(aiDrafts, plainText, kind);
    if (drafts.length === 0 && regexDrafts.length > 0) {
      return regexDrafts;
    }
    if (drafts.length === 0) {
      throw new Error("Could not read any reservations from this file. Try a PDF, screenshot, or HTML confirmation.");
    }
    return drafts;
  } catch (error) {
    if (regexDrafts.length > 0) {
      return regexDrafts;
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Confirmation scan failed.");
  }
}

export { resolveConfirmationScanKind as confirmationScanKind };
