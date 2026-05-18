export type TripFlowStage = "readiness" | "pre-departure" | "airport" | "arrival" | "recovery";
export type TripFlowPanel = "ops" | "anti-miss" | "collaboration" | "recovery";
export type TripFlowConfidence = "high" | "medium" | "low";

const STAGES: TripFlowStage[] = ["readiness", "pre-departure", "airport", "arrival", "recovery"];

const FOCUS_PANEL_RULES: Record<TripFlowPanel, readonly TripFlowStage[]> = {
  ops: ["airport", "recovery"],
  "anti-miss": ["pre-departure", "airport"],
  collaboration: ["arrival", "recovery"],
  recovery: ["recovery"],
};

export function shouldShowFocusPanel(args: {
  panel: TripFlowPanel;
  stage: TripFlowStage;
  focusMode: boolean;
}): boolean {
  if (!args.focusMode) {
    return true;
  }
  return FOCUS_PANEL_RULES[args.panel].includes(args.stage);
}

export function shouldQuickAddGoToReview(args: {
  confidence: TripFlowConfidence;
  inputText: string;
}): boolean {
  const normalized = args.inputText.trim();
  if (args.confidence === "low") {
    return true;
  }
  if (normalized.length < 18) {
    return true;
  }
  const hasTimeSignal = /\b\d{1,2}:\d{2}\b/.test(normalized) || /\b(am|pm)\b/i.test(normalized);
  if (!hasTimeSignal && args.confidence !== "high") {
    return true;
  }
  return false;
}

export function nextTripStage(stage: TripFlowStage): TripFlowStage {
  const index = STAGES.indexOf(stage);
  if (index < 0 || index >= STAGES.length - 1) {
    return "recovery";
  }
  return STAGES[index + 1] ?? "recovery";
}
