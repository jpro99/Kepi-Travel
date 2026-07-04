import Anthropic from "@anthropic-ai/sdk";
import {
  confirmationScanKind,
  parseScannedReservationsJson,
  type ScannedReservationDraft,
} from "@/lib/travelAssistant/scannedReservationDraft";

const SCAN_SYSTEM_PROMPT = [
  "You extract travel reservations from confirmation documents (PDF e-tickets, boarding passes, hotel vouchers, rail tickets).",
  "Return ONLY strict JSON — no explanation text.",
  "Shape:",
  '{ "reservations": [ { "type": "", "title": "", "provider": "", "confirmationCode": "", "localTime": "", "checkOutDate": "", "timezone": "", "location": "", "notes": "", "flightNumber": "", "departureAirport": "", "arrivalAirport": "", "roomType": "", "cashUsd": 0, "pointsMiles": 0, "pointsProgram": "" } ] }',
  "CRITICAL — MULTI-LEG ITINERARIES: Scan the ENTIRE document for EVERY flight segment and EVERY hotel.",
  "A single PDF may contain 5+ flights (e.g. ONT→SEA→FCO→BRI and later MUC→CGK for Indonesia) — return ONE object per segment in reservations[].",
  "Never merge legs. Each flight needs its own flightNumber, departureAirport, arrivalAirport, and localTime (that leg's scheduled DEPARTURE).",
  "For hotels on the same document, add a separate reservations[] object with type=hotel, localTime=check-in (YYYY-MM-DD HH:mm), checkOutDate=YYYY-MM-DD.",
  "type values: flight, hotel, train, ride, dinner.",
  "localTime for flights = scheduled gate departure in YYYY-MM-DD HH:mm 24-hour. NOT boarding time, purchase date, or email/print date.",
  "If year is missing on one leg but visible on another leg in the same document, reuse that year.",
  "If year is still missing but month/day are clearly a future trip date, infer the year from context on the document.",
  "flightNumber = 2-letter IATA airline code + number (AS832, AZ1234, GA123). Never credit-card fragments.",
  "departureAirport / arrivalAirport = IATA codes (BRI, FCO, CGK, DPS, SIN, MUC, SEA, ONT). Bali=DPS, Jakarta=CGK.",
  "timezone = IANA timezone of the DEPARTURE city (Europe/Rome, Asia/Jakarta, America/Los_Angeles).",
  "For award tickets: cashUsd=0, fill pointsMiles + pointsProgram when visible.",
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

export async function extractConfirmationDocument(
  file: File,
  apiKey: string,
): Promise<ScannedReservationDraft[]> {
  const kind = confirmationScanKind(file);
  const fileBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const client = new Anthropic({ apiKey });

  const documentBlock =
    kind === "pdf"
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: fileBase64,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: imageMediaType(file),
            data: fileBase64,
          },
        };

  const scanResponse = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
    temperature: 0,
    system: SCAN_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          documentBlock,
          {
            type: "text",
            text:
              kind === "pdf"
                ? "Extract every flight segment and every hotel from this PDF. Return all of them in reservations[]."
                : "Extract every reservation visible on this ticket image. Return all in reservations[].",
          },
        ],
      },
    ],
  });

  const modelText = scanResponse.content
    .filter((block): block is Extract<(typeof scanResponse.content)[number], { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  const drafts = parseScannedReservationsJson(modelText);
  if (drafts.length === 0) {
    throw new Error("Ticket scan model returned an invalid response.");
  }
  return drafts;
}
