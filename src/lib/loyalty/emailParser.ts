// Parse loyalty balance update emails forwarded to Kepi
// Detects balance updates from airline and hotel programs

export interface ParsedLoyaltyUpdate {
  programId: string;
  miles: number;
  tier?: string;
  source: "email";
  confidence: "high" | "medium";
}

// Email sender → program ID
const SENDER_MAP: Record<string, string> = {
  "alaskaair.com": "alaska",
  "delta.com": "delta",
  "united.com": "united",
  "aa.com": "american",
  "southwest.com": "southwest",
  "jetblue.com": "jetblue",
  "britishairways.com": "british",
  "airfrance.com": "air_france",
  "klm.com": "air_france",
  "singaporeair.com": "singapore",
  "turkishairlines.com": "turkish",
  "hyatt.com": "hyatt",
  "marriott.com": "marriott",
  "hilton.com": "hilton",
  "ihg.com": "ihg",
  "chase.com": "chase_ur",
  "americanexpress.com": "amex_mr",
};

// Patterns to extract mile/point balances from email text
const BALANCE_PATTERNS = [
  // "Your balance: 45,231 miles"
  /(?:your|current|total|account)\s+balance[:\s]+([0-9,]+)\s*(?:miles?|points?|awards?)/i,
  // "45,231 miles in your account"
  /([0-9,]+)\s+(?:miles?|points?|awards?)\s+(?:in your|available|earned|remaining)/i,
  // "Balance: 45,231"
  /balance[:\s]+([0-9,]+)/i,
  // "You've earned 500 bonus miles. Total: 45,231"
  /total[:\s]+([0-9,]+)/i,
  // "45,231 MileagePlus miles"
  /([0-9,]+)\s+(?:mileageplus|skyмiles|rapid rewards|trueblue|avios|lifemiles|flying blue)\s+(?:miles?|points?)/i,
];

// Patterns to extract tier status
const TIER_PATTERNS = [
  /(?:status|tier|level)[:\s]+([A-Za-z\s]+(?:Gold|Silver|Platinum|Diamond|Elite|MVP|1K|GlobalistAG|Explorer))/i,
  /(MVP Gold|MVP|Elite|Global Services|1K|Premier|Diamond|Platinum|Gold|Silver|Explorer)\s+(?:member|status|tier)/i,
];

export function parseLoyaltyEmail(
  senderEmail: string,
  subject: string,
  body: string,
): ParsedLoyaltyUpdate | null {
  // Identify program from sender
  const domain = senderEmail.split("@")[1]?.toLowerCase() ?? "";
  let programId: string | null = null;

  for (const [senderDomain, progId] of Object.entries(SENDER_MAP)) {
    if (domain.includes(senderDomain)) {
      programId = progId;
      break;
    }
  }

  // Also check subject for program hints
  if (!programId) {
    const subjectLower = subject.toLowerCase();
    if (subjectLower.includes("mileage plan") || subjectLower.includes("alaska")) programId = "alaska";
    else if (subjectLower.includes("skymiles") || subjectLower.includes("delta")) programId = "delta";
    else if (subjectLower.includes("mileageplus") || subjectLower.includes("united")) programId = "united";
    else if (subjectLower.includes("aadvantage") || subjectLower.includes("american airlines")) programId = "american";
    else if (subjectLower.includes("rapid rewards") || subjectLower.includes("southwest")) programId = "southwest";
    else if (subjectLower.includes("world of hyatt") || subjectLower.includes("hyatt")) programId = "hyatt";
    else if (subjectLower.includes("bonvoy") || subjectLower.includes("marriott")) programId = "marriott";
    else if (subjectLower.includes("honors") || subjectLower.includes("hilton")) programId = "hilton";
    else if (subjectLower.includes("ultimate rewards") || subjectLower.includes("chase")) programId = "chase_ur";
    else if (subjectLower.includes("membership rewards") || subjectLower.includes("amex")) programId = "amex_mr";
  }

  if (!programId) return null;

  // Check if this is a balance update email
  const isBalanceEmail = /balance|statement|earned|activity|miles|points|account summary/i.test(subject + " " + body.slice(0, 500));
  if (!isBalanceEmail) return null;

  // Extract balance
  const fullText = `${subject}\n${body}`;
  let miles: number | null = null;
  let confidence: "high" | "medium" = "medium";

  for (const pattern of BALANCE_PATTERNS) {
    const match = fullText.match(pattern);
    if (match?.[1]) {
      const parsed = parseInt(match[1].replace(/,/g, ""), 10);
      if (!isNaN(parsed) && parsed > 0 && parsed < 10_000_000) {
        miles = parsed;
        confidence = pattern === BALANCE_PATTERNS[0] ? "high" : "medium";
        break;
      }
    }
  }

  if (!miles) return null;

  // Extract tier
  let tier: string | undefined;
  for (const pattern of TIER_PATTERNS) {
    const match = fullText.match(pattern);
    if (match?.[1]) {
      tier = match[1].trim();
      break;
    }
  }

  return { programId, miles, tier, source: "email", confidence };
}
