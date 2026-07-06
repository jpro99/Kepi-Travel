import type { TravelerGenome } from "@/lib/traveler/types";

export type InputStyleChannel =
  | "email-forward"
  | "gmail-import"
  | "manual"
  | "voice"
  | "scan"
  | "unknown";

export interface InputChannelStats {
  channel: InputStyleChannel;
  attempts: number;
  corrections: number;
}

export interface InputStyleProfile {
  channels: InputChannelStats[];
  lastUpdated: string;
}

export interface InputStyleSuggestion {
  channel: InputStyleChannel;
  message: string;
  correctionRate: number;
  attempts: number;
}

export const INPUT_STYLE_MIN_ATTEMPTS = 3;
export const INPUT_STYLE_MAX_CORRECTION_RATE = 0.25;

const CHANNEL_LABELS: Record<InputStyleChannel, string> = {
  "email-forward": "forward the confirmation email",
  "gmail-import": "import from your inbox",
  manual: "type it in manually",
  voice: "use voice input",
  scan: "scan the confirmation",
  unknown: "add it manually",
};

function normalizeChannel(value: string | undefined): InputStyleChannel {
  if (value === "email-forward") return "email-forward";
  if (value === "gmail-import") return "gmail-import";
  if (value === "manual") return "manual";
  if (value === "voice") return "voice";
  if (value === "scan") return "scan";
  return "unknown";
}

export function recordInputStyleEvent(
  profile: InputStyleProfile | undefined,
  input: { channel: string | undefined; corrected: boolean; at?: string },
): InputStyleProfile {
  const channel = normalizeChannel(input.channel);
  const channels = [...(profile?.channels ?? [])];
  const index = channels.findIndex((entry) => entry.channel === channel);
  if (index >= 0) {
    channels[index] = {
      ...channels[index],
      attempts: channels[index].attempts + 1,
      corrections: channels[index].corrections + (input.corrected ? 1 : 0),
    };
  } else {
    channels.push({
      channel,
      attempts: 1,
      corrections: input.corrected ? 1 : 0,
    });
  }
  return {
    channels,
    lastUpdated: input.at ?? new Date().toISOString(),
  };
}

export function suggestInputStyleShortcut(
  profile: InputStyleProfile | undefined,
): InputStyleSuggestion | null {
  if (!profile || profile.channels.length === 0) return null;
  const ranked = [...profile.channels]
    .filter((entry) => entry.attempts >= INPUT_STYLE_MIN_ATTEMPTS)
    .map((entry) => ({
      ...entry,
      correctionRate: entry.corrections / Math.max(1, entry.attempts),
    }))
    .sort((left, right) => {
      if (left.correctionRate !== right.correctionRate) {
        return left.correctionRate - right.correctionRate;
      }
      return right.attempts - left.attempts;
    });
  const best = ranked[0];
  if (!best || best.correctionRate > INPUT_STYLE_MAX_CORRECTION_RATE) {
    return null;
  }
  return {
    channel: best.channel,
    correctionRate: best.correctionRate,
    attempts: best.attempts,
    message: `You usually ${CHANNEL_LABELS[best.channel]} — want to do that instead?`,
  };
}

export function mergeInputStyleIntoGenome(
  genome: TravelerGenome,
  profile: InputStyleProfile,
): TravelerGenome {
  return {
    ...genome,
    inputStyle: profile,
    updatedAt: new Date().toISOString(),
  };
}

export function getInputStyleFromGenome(genome: TravelerGenome): InputStyleProfile | undefined {
  return genome.inputStyle;
}
