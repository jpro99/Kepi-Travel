import Anthropic from "@anthropic-ai/sdk";
import type { RawMessageStreamEvent } from "@anthropic-ai/sdk/resources/messages/messages";
import { logger } from "@/lib/logger";

const AI_MODEL = "claude-sonnet-4-20250514";
const OUTPUT_FILTER_PATTERN = /travel\s+insurance/giu;
const PROMPT_FILTER_PATTERN = /\binsurance\b/giu;

const SYSTEM_PROMPT = [
  "You are a premium adaptive travel operations copilot for U.S. travelers.",
  "Focus only on logistics and trip execution from readiness through disruption recovery.",
  "Exclude all insurance-related products, policies, claims, reimbursements, and discussions.",
  "Prioritize anti-miss safeguards with timezone-aware timing, latest safe departure moments, and concrete next steps.",
  "Keep guidance concise, practical, and calm with clear action order.",
].join(" ");

export type AISuggestionReservation = {
  id?: string;
  type: string;
  title: string;
  provider?: string;
  localTime?: string;
  timezone?: string;
  location?: string;
  confirmationCode?: string;
  notes?: string;
};

export type AISuggestionDisruption = {
  scenario: string;
  severity?: string;
  summary?: string;
  location?: string;
  impactedReservations?: AISuggestionReservation[];
  latestUpdates?: Array<{
    provider?: string;
    summary: string;
    severity?: string;
  }>;
};

type AnthropicLikeClient = {
  messages: {
    stream: (args: {
      model: string;
      max_tokens: number;
      temperature: number;
      system: string;
      metadata: {
        user_id: string;
      };
      messages: Array<{
        role: "user";
        content: string;
      }>;
    }) => AsyncIterable<RawMessageStreamEvent>;
  };
};

let clientFactory: () => AnthropicLikeClient | null = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new Anthropic({ apiKey });
};

export function setAISuggestionClientFactoryForTests(factory: (() => AnthropicLikeClient | null) | null): void {
  clientFactory = factory ?? (() => {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return null;
    }
    return new Anthropic({ apiKey });
  });
}

function sanitizePromptInput(value: string): string {
  return value.replace(PROMPT_FILTER_PATTERN, "[excluded]");
}

function sanitizeModelOutput(value: string): string {
  return value.replace(OUTPUT_FILTER_PATTERN, "coverage planning");
}

function reservationsDigest(reservations: readonly AISuggestionReservation[]): string {
  if (reservations.length === 0) {
    return "No reservations were provided.";
  }
  return reservations
    .slice(0, 20)
    .map((reservation, index) => {
      return [
        `${index + 1}. ${reservation.type.toUpperCase()} — ${reservation.title}`,
        reservation.provider ? `provider: ${reservation.provider}` : null,
        reservation.localTime ? `time: ${reservation.localTime}` : null,
        reservation.timezone ? `timezone: ${reservation.timezone}` : null,
        reservation.location ? `location: ${reservation.location}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
}

async function* streamClaudeSuggestion(args: {
  userId: string;
  intent: string;
  prompt: string;
  fallbackText: string;
}): AsyncGenerator<string> {
  const scopedLogger = logger.withContext({
    userId: args.userId,
    intent: args.intent,
    route: "aiSuggestionService",
  });

  const client = clientFactory();
  if (!client) {
    scopedLogger.warn("Anthropic API key missing. Using fallback AI guidance.");
    yield sanitizeModelOutput(args.fallbackText);
    return;
  }

  try {
    const stream = client.messages.stream({
      model: AI_MODEL,
      max_tokens: 900,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      metadata: {
        user_id: args.userId.slice(0, 120),
      },
      messages: [
        {
          role: "user",
          content: sanitizePromptInput(args.prompt),
        },
      ],
    });

    let emitted = false;
    for await (const event of stream) {
      if (event.type !== "content_block_delta") {
        continue;
      }
      if (event.delta.type !== "text_delta") {
        continue;
      }
      const chunk = sanitizeModelOutput(event.delta.text);
      if (!chunk) {
        continue;
      }
      emitted = true;
      yield chunk;
    }

    if (!emitted) {
      yield sanitizeModelOutput(args.fallbackText);
    }
  } catch (error) {
    scopedLogger.warn("Claude suggestion stream failed. Falling back to static guidance.", {
      error,
    });
    yield sanitizeModelOutput(args.fallbackText);
  }
}

export async function* generateLayoverSuggestions(
  userId: string,
  airport: string,
  layoverMinutes: number,
): AsyncGenerator<string> {
  const prompt = [
    "Build a concise premium layover plan.",
    `Airport code: ${airport || "unknown"}.`,
    `Available layover time: ${Math.max(0, Math.round(layoverMinutes))} minutes.`,
    "Output format:",
    "1) Quick options now (2-4 options with estimated time windows)",
    "2) Latest safe return-to-gate timing",
    "3) Anti-miss checklist (3 bullets)",
    "4) If conditions worsen, what to do immediately",
  ].join("\n");

  const fallbackText = [
    "Quick options now:",
    "- Stay in-terminal and choose one short meal or hydration stop.",
    "- Keep one short buffer task only if you can return quickly.",
    "",
    "Latest safe return-to-gate timing:",
    "- Start walking back no later than 45 minutes before boarding for domestic legs.",
    "",
    "Anti-miss checklist:",
    "- Recheck gate and boarding time every 15 minutes.",
    "- Keep boarding pass and ID accessible.",
    "- Set two reminders: return-to-gate and final boarding.",
  ].join("\n");

  yield* streamClaudeSuggestion({
    userId,
    intent: "layover",
    prompt,
    fallbackText,
  });
}

export async function* generateDisruptionRecoveryPlan(
  userId: string,
  disruption: AISuggestionDisruption,
): AsyncGenerator<string> {
  const prompt = [
    "Create an operational disruption recovery plan focused on speed and certainty.",
    `Scenario: ${disruption.scenario}.`,
    disruption.severity ? `Severity: ${disruption.severity}.` : null,
    disruption.summary ? `Summary: ${disruption.summary}.` : null,
    disruption.location ? `Location: ${disruption.location}.` : null,
    disruption.impactedReservations && disruption.impactedReservations.length > 0
      ? `Impacted reservations:\n${reservationsDigest(disruption.impactedReservations)}`
      : null,
    disruption.latestUpdates && disruption.latestUpdates.length > 0
      ? `Latest updates:\n${JSON.stringify(disruption.latestUpdates, null, 2)}`
      : null,
    "Output format:",
    "1) Rebooking path (priority order)",
    "2) Nearby lodging fallback shortlist guidance",
    "3) Ground transport alternatives",
    "4) Exact call script starter and immediate next actions",
  ]
    .filter(Boolean)
    .join("\n");

  const fallbackText = [
    "Rebooking path:",
    "1) Contact primary carrier support and request earliest protected routing.",
    "2) Ask for same-day partner alternatives if primary inventory is full.",
    "",
    "Nearby lodging fallback:",
    "- Target airport-adjacent or station-adjacent hotels first.",
    "- Confirm late check-in hold before booking.",
    "",
    "Ground transport alternatives:",
    "- Compare rail, app rides, and shuttle options for earliest departure.",
    "- Lock one backup transport in case queue times spike.",
    "",
    "Call script starter:",
    "\"I need the fastest rebooking option available today and a confirmation sent now.\"",
  ].join("\n");

  yield* streamClaudeSuggestion({
    userId,
    intent: "disruption",
    prompt,
    fallbackText,
  });
}

export async function* generatePackingReminders(
  userId: string,
  reservations: readonly AISuggestionReservation[],
): AsyncGenerator<string> {
  const prompt = [
    "Generate practical packing and preparation reminders from this trip plan.",
    "Trip reservations:",
    reservationsDigest(reservations),
    "Output format:",
    "1) Essentials to pack now",
    "2) 24-hour pre-departure prep",
    "3) Day-of-departure checklist",
    "4) High-risk items likely to cause delays if forgotten",
  ].join("\n");

  const fallbackText = [
    "Essentials to pack now:",
    "- ID/passport, chargers, medication, and critical confirmations.",
    "- One change of clothes in carry-on for disruption resilience.",
    "",
    "24-hour pre-departure prep:",
    "- Verify check-in windows and transportation pickup timing.",
    "- Confirm power banks/devices are charged.",
    "",
    "Day-of-departure checklist:",
    "- Reconfirm departure terminal/platform details.",
    "- Recheck weather and local transit disruptions before leaving.",
  ].join("\n");

  yield* streamClaudeSuggestion({
    userId,
    intent: "packing",
    prompt,
    fallbackText,
  });
}

export async function* generateTripBriefing(
  userId: string,
  reservations: readonly AISuggestionReservation[],
): AsyncGenerator<string> {
  const prompt = [
    "Create a concise pre-trip briefing from the itinerary data below.",
    "Trip reservations:",
    reservationsDigest(reservations),
    "Output format:",
    "1) Schedule snapshot and critical timing risks",
    "2) Weather checks to run before departure",
    "3) Entry/local transit checks to confirm",
    "4) Local arrival tips for smooth first-night execution",
  ].join("\n");

  const fallbackText = [
    "Schedule snapshot:",
    "- Confirm all critical departure/check-in windows and keep one-hour risk buffers where possible.",
    "",
    "Weather checks:",
    "- Check destination weather and transit impact within 12 hours of departure.",
    "",
    "Entry/local transit checks:",
    "- Verify required ID/travel documents and local transfer pickup details.",
    "",
    "Arrival tips:",
    "- Share first-night meeting point and backup contact method with the group.",
  ].join("\n");

  yield* streamClaudeSuggestion({
    userId,
    intent: "briefing",
    prompt,
    fallbackText,
  });
}
