import { generateId } from "@/lib/utils/generateId";
type PlanType = "free" | "pro" | "concierge";

export type KepiAnalyticsEvent =
  | { type: "trip_created"; userId: string; tripId: string; plan: PlanType }
  | { type: "reservation_added"; userId: string; tripId: string; reservationType: string }
  | { type: "stage_advanced"; userId: string; tripId: string; newStage: string }
  | { type: "disruption_detected"; userId: string; tripId: string; disruptionType: string }
  | { type: "autopilot_applied"; tripId: string | null; recommendationTitle: string }
  | { type: "share_link_created"; userId: string; tripId: string; readOnly: boolean; expiresInDays: number }
  | { type: "upgrade_clicked"; currentPlan: PlanType; featureGated?: string; targetPlan?: PlanType }
  | { type: "upgrade_completed"; userId: string; newPlan: "pro" | "concierge" }
  | { type: "gmail_import_triggered"; userId: string; maxResults: number; tripId?: string; lookbackDays?: number; tripStartDate?: string | null; tripEndDate?: string | null }
  | { type: "ai_suggestion_requested"; userId: string; suggestionType: string; tripId?: string }
  | { type: "invite_code_redeemed"; userId: string; inviteType: string; inviteCode: string };

export type AnalyticsPrimitive = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsPrimitive>;

export interface StoredKepiAnalyticsEvent {
  id: string;
  type: KepiAnalyticsEvent["type"];
  createdAt: string;
  userId: string | null;
  properties: AnalyticsProperties;
}

export function createAnalyticsEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return generateId();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function extractAnalyticsUserId(event: KepiAnalyticsEvent): string | null {
  if ("userId" in event && typeof event.userId === "string") {
    return event.userId;
  }
  return null;
}

export function buildAnalyticsProperties(event: KepiAnalyticsEvent): AnalyticsProperties {
  const entries = Object.entries(event).filter(([key]) => key !== "type");
  const properties: AnalyticsProperties = {};
  for (const [key, value] of entries) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      properties[key] = value;
    }
  }
  return properties;
}

export async function trackEvent(event: KepiAnalyticsEvent): Promise<void> {
  const properties = buildAnalyticsProperties(event);

  if (process.env.NODE_ENV !== "production") {
    console.info("[ANALYTICS][DEV]", event.type, properties);
    return;
  }

  try {
    if (typeof window === "undefined") {
      const { track } = await import("@vercel/analytics/server");
      await track(event.type, properties);
      return;
    }
    const { track } = await import("@vercel/analytics");
    track(event.type, properties);
  } catch {
    // Analytics failures should never block product flows.
  }
}
