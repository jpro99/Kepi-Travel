"use client";

import type { TravelFocusMode } from "@/lib/travelAssistant/travelFocusHonestyFilter";
import { TRAVEL_FOCUS_MODES } from "@/lib/travelAssistant/travelFocusHonestyFilter";
import type { FocusExperimentStagePayload } from "@/lib/travelAssistant/travelFocusExperiment";
import { isNative } from "@/lib/native/platform";

type WebkitFocusFilterBridge = {
  postMessage: (message: Record<string, unknown>) => void;
};

function webkitBridge(): WebkitFocusFilterBridge | null {
  if (typeof window === "undefined") return null;
  const handler = (
    window as unknown as {
      webkit?: { messageHandlers?: { kepiFocusFilter?: WebkitFocusFilterBridge } };
    }
  ).webkit?.messageHandlers?.kepiFocusFilter;
  return handler ?? null;
}

/** True when the iOS shell exposes SetFocusFilterIntent bridge hooks. */
export function isFocusFilterNativeAvailable(): boolean {
  return webkitBridge() != null || isNative();
}

export function syncNativeFocusFilterCriteria(
  greenDisruptionIds: readonly string[],
  focusModes: readonly TravelFocusMode[] = TRAVEL_FOCUS_MODES,
): { delivered: boolean; channel: "focus-filter" | "web-honest-fallback" } {
  const bridge = webkitBridge();
  if (!bridge) {
    return { delivered: false, channel: "web-honest-fallback" };
  }
  bridge.postMessage({
    action: "sync",
    greenDisruptionIds: [...greenDisruptionIds],
    focusModes: [...focusModes],
  });
  return { delivered: true, channel: "focus-filter" };
}

/** Push staged experiment payload to native shell for on-device PASS. */
export function stageNativeFocusExperiment(
  payload: FocusExperimentStagePayload,
): { delivered: boolean; channel: "focus-filter" | "web-honest-fallback" } {
  const bridge = webkitBridge();
  if (!bridge) {
    return { delivered: false, channel: "web-honest-fallback" };
  }
  bridge.postMessage({
    action: "stage-experiment",
    arm: payload.arm,
    scenario: payload.scenario,
    disruptionId: payload.charge.disruptionId,
    filterCriteria: payload.charge.filterCriteria,
    interruptionLevel: payload.charge.interruptionLevel,
    greenFilterCriteria: payload.greenFilterCriteria,
    focusModes: [...TRAVEL_FOCUS_MODES],
  });
  return { delivered: true, channel: "focus-filter" };
}
