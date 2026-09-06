"use client";

import type { LiveActivityData } from "@/lib/ambient/types";
import type { ProvenanceChargeLiveActivityPayload } from "@/lib/travelAssistant/provenanceChargeLiveActivity";
import { isNative } from "@/lib/native/platform";

type WebkitLiveActivityBridge = {
  postMessage: (message: Record<string, unknown>) => void;
};

function webkitBridge(): WebkitLiveActivityBridge | null {
  if (typeof window === "undefined") return null;
  const handler = (
    window as unknown as {
      webkit?: { messageHandlers?: { kepiLiveActivity?: WebkitLiveActivityBridge } };
    }
  ).webkit?.messageHandlers?.kepiLiveActivity;
  return handler ?? null;
}

/** True when the iOS shell exposes ActivityKit bridge hooks. */
export function isLiveActivityNativeAvailable(): boolean {
  return webkitBridge() != null || isNative();
}

export function liveActivityWebFallbackMessage(
  payload: ProvenanceChargeLiveActivityPayload | LiveActivityData,
): string {
  return payload.webFallbackHonest;
}

function serializePayload(data: LiveActivityData): Record<string, unknown> {
  return {
    action: "update",
    primary: data.primary,
    secondary: data.secondary,
    tertiary: data.tertiary,
    progress: data.progress,
    journeyState: data.journeyState,
    showCountdown: data.showCountdown,
    gateProvenance: data.gateProvenance,
    statusProvenance: data.statusProvenance,
    rightsShell: data.rightsShell,
  };
}

/** Push to native ActivityKit when available; honest no-op on web. */
export function updateNativeLiveActivity(data: LiveActivityData): {
  delivered: boolean;
  channel: "activitykit" | "web-honest-fallback";
} {
  const bridge = webkitBridge();
  if (bridge) {
    bridge.postMessage(serializePayload(data));
    return { delivered: true, channel: "activitykit" };
  }
  return {
    delivered: false,
    channel: "web-honest-fallback",
  };
}

export function endNativeLiveActivity(): void {
  webkitBridge()?.postMessage({ action: "end" });
}

export function updateLiveActivityFromProvenanceCharge(
  payload: ProvenanceChargeLiveActivityPayload,
  journeyState: string,
): {
  delivered: boolean;
  channel: "activitykit" | "web-honest-fallback" | "provenance-skip";
} {
  if (!payload.shouldUpdate) {
    return { delivered: false, channel: "provenance-skip" };
  }
  const data: LiveActivityData = {
    primary: payload.primary,
    secondary: payload.secondary,
    tertiary: payload.tertiary,
    progress: payload.progress,
    journeyState,
    showCountdown: payload.showCountdown,
    gateProvenance: payload.gateProvenance,
    statusProvenance: payload.statusProvenance,
    rightsShell: payload.rightsShell,
    webFallbackHonest: payload.webFallbackHonest,
  };
  if (!data.showCountdown && data.gateProvenance === "UNVERIFIED" && data.statusProvenance === "UNVERIFIED" && !data.rightsShell) {
    return { delivered: false, channel: "provenance-skip" };
  }
  const result = updateNativeLiveActivity(data);
  return result;
}
