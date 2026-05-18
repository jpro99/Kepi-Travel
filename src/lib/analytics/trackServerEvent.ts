import { logger } from "@/lib/logger";
import { kvStoreSet } from "@/lib/travelAssistant/kvStore";
import {
  buildAnalyticsProperties,
  createAnalyticsEventId,
  extractAnalyticsUserId,
  trackEvent,
  type KepiAnalyticsEvent,
  type StoredKepiAnalyticsEvent,
} from "@/lib/analytics/trackEvent";

const ANALYTICS_NAMESPACE_USER = "__analytics";

export async function trackServerEvent(event: KepiAnalyticsEvent): Promise<void> {
  const record: StoredKepiAnalyticsEvent = {
    id: createAnalyticsEventId(),
    type: event.type,
    createdAt: new Date().toISOString(),
    userId: extractAnalyticsUserId(event),
    properties: buildAnalyticsProperties(event),
  };

  try {
    await kvStoreSet(`events/${record.createdAt}-${record.id}`, record, {
      userId: ANALYTICS_NAMESPACE_USER,
    });
  } catch (error) {
    logger.warn("Failed to persist server analytics event.", {
      scope: "analytics/trackServerEvent",
      eventType: event.type,
      error,
    });
  }

  await trackEvent(event);
}
