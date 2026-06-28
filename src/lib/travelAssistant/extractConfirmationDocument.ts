import Anthropic from "@anthropic-ai/sdk";
import {
  confirmationScanKind,
  parseScannedReservationJson,
  type ScannedReservationDraft,
} from "@/lib/travelAssistant/scannedReservationDraft";

const SCAN_SYSTEM_PROMPT = [
  "You extract reservation details from travel confirmation documents.",
  "Input may be airline boarding passes, e-ticket PDFs, hotel vouchers, rail tickets, or restaurant reservations.",
  "Read multilingual text including Italian, Japanese, and European formats when present.",
  "Return strict JSON only.",
  "Use this exact shape:",
  '{ "reservation": { "type": "", "provider": "", "title": "", "date": "", "time": "", "timezone": "", "confirmationCode": "", "departureAirport": "", "arrivalAirport": "", "location": "", "flightOrTrainNumber": "", "roomType": "", "checkOutDate": "", "notes": "" } }',
  "type must be one of: flight, hotel, train, ride, dinner.",
  "CRITICAL: Only extract what is explicitly visible. NEVER guess, infer, or assume any field.",
  "For flights, time = DEPARTURE time (when the plane leaves), NOT boarding or check-in time.",
  "If the year is not shown, set date to empty string — do NOT assume the current year.",
  "Use ISO date YYYY-MM-DD only when the full date including year is clearly visible. Use 24-hour HH:mm for time.",
  "For flights: departureAirport and arrivalAirport = IATA codes (e.g. BRI, VCE, HND). Bari=BRI, Venice=VCE.",
  "For Italian carriers: ITA Airways=AZ, Ryanair=FR, easyJet=U2.",
  "Do not invent confirmation codes, dates, or any other fields.",
].join(" ");

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
): Promise<ScannedReservationDraft> {
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
    max_tokens: 1200,
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
                ? "Extract reservation fields from this PDF travel confirmation."
                : "Extract reservation fields from this ticket image.",
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

  return parseScannedReservationJson(modelText);
}
