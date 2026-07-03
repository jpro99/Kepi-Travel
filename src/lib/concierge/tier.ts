// Concierge tier — human backup for disruptions
// Pro plan: AI-powered alerts and automation
// Concierge ($49/mo): human expert called within 5 min of cancellation

export type UserTier = "free" | "pro" | "concierge";

export interface ConciergeAlert {
  userId: string;
  tripId: string;
  type: "cancellation" | "long_delay" | "missed_connection" | "diversion";
  flightNumber: string;
  route: string;
  severity: "high" | "critical";
  detectedAt: string;
  message: string;
  alternativesFound: number;
  handled: boolean;
}

export function getConciergeMessage(tier: UserTier, alertType: ConciergeAlert["type"]): string {
  if (tier === "concierge") {
    return alertType === "cancellation"
      ? "Your flight was cancelled. A Kepi concierge is calling you within 5 minutes to rebook."
      : "Your travel expert has been notified and is reviewing your options now.";
  }
  if (tier === "pro") {
    return alertType === "cancellation"
      ? "Your flight was cancelled. Kepi found alternatives below — tap to rebook."
      : "Your connection is at risk. Review your options below.";
  }
  return "Your flight has a problem. Upgrade to Pro to see alternatives instantly.";
}

export function getUpsellMessage(alertType: ConciergeAlert["type"]): {
  pro: string;
  concierge: string;
} {
  return {
    pro: "Upgrade to Pro ($12/mo) — see alternatives instantly and never miss a connection again.",
    concierge: "Upgrade to Concierge ($49/mo) — a human travel expert handles rebooking while you relax.",
  };
}
