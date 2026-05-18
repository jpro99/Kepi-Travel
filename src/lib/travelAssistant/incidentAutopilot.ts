import type {
  TravelBackgroundWorkerHealth,
  TravelOpsHealthStatus,
} from "@/lib/travelAssistant/travelUpdateTypes";
import type { TripFlowStage } from "@/lib/travelAssistant/tripFlowControls";

export type IncidentAutopilotPriority = "critical" | "high" | "medium";

export type IncidentAutopilotAction =
  | "switch-recovery-stage"
  | "dispatch-reminders"
  | "run-smart-escalation"
  | "sync-now"
  | "open-review-top"
  | "run-background-once"
  | "refresh-ops"
  | "trigger-alert-sweep"
  | "reset-circuits";

export interface IncidentAutopilotRecommendation {
  id: string;
  priority: IncidentAutopilotPriority;
  title: string;
  rationale: string;
  action: IncidentAutopilotAction;
}

export interface IncidentAutopilotSignals {
  tripStage: TripFlowStage;
  tripStatus: "green" | "yellow" | "red";
  activeScenario: "none" | "missed-flight" | "train-delay" | "ride-no-show";
  unresolvedReviewCount: number;
  blockingIssueCount: number;
  dueReminderCount: number;
  pendingSyncCount: number;
  canSyncItineraryNow: boolean;
  providerCircuitOpen: boolean;
  opsHealth: TravelOpsHealthStatus | null;
  workerHealth: TravelBackgroundWorkerHealth | null;
}

function pushUnique(
  recommendations: IncidentAutopilotRecommendation[],
  recommendation: IncidentAutopilotRecommendation,
): void {
  if (recommendations.some((entry) => entry.id === recommendation.id)) {
    return;
  }
  recommendations.push(recommendation);
}

const PRIORITY_RANK: Record<IncidentAutopilotPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

export function buildIncidentAutopilotPlan(
  signals: IncidentAutopilotSignals,
): IncidentAutopilotRecommendation[] {
  const recommendations: IncidentAutopilotRecommendation[] = [];
  const hasLiveIncident = signals.activeScenario !== "none" || signals.tripStatus === "red";

  if (hasLiveIncident && signals.tripStage !== "recovery") {
    pushUnique(recommendations, {
      id: "switch-recovery-stage",
      priority: "critical",
      title: "Switch to recovery stage",
      rationale: "Critical incident detected outside recovery workspace.",
      action: "switch-recovery-stage",
    });
  }

  if (signals.dueReminderCount > 0 && hasLiveIncident) {
    pushUnique(recommendations, {
      id: "dispatch-reminders",
      priority: "critical",
      title: "Dispatch overdue reminders",
      rationale: `${signals.dueReminderCount} reminder checkpoints are due while incident pressure is active.`,
      action: "dispatch-reminders",
    });
  }

  if (signals.blockingIssueCount > 0) {
    pushUnique(recommendations, {
      id: "run-smart-escalation",
      priority: signals.blockingIssueCount >= 2 ? "critical" : "high",
      title: "Run smart escalation",
      rationale: `${signals.blockingIssueCount} high-severity timeline blockers require immediate triage.`,
      action: "run-smart-escalation",
    });
  }

  if (signals.unresolvedReviewCount > 0) {
    pushUnique(recommendations, {
      id: "open-review-top",
      priority: signals.unresolvedReviewCount >= 2 ? "high" : "medium",
      title: "Resolve top review queue item",
      rationale: `${signals.unresolvedReviewCount} unresolved review items can hide unsafe itinerary details.`,
      action: "open-review-top",
    });
  }

  if (signals.pendingSyncCount > 0 && signals.canSyncItineraryNow) {
    pushUnique(recommendations, {
      id: "sync-now",
      priority: hasLiveIncident ? "critical" : "high",
      title: "Flush pending sync now",
      rationale: `${signals.pendingSyncCount} pending updates are ready to replay.`,
      action: "sync-now",
    });
  }

  if (signals.workerHealth === "unhealthy") {
    pushUnique(recommendations, {
      id: "run-background-once",
      priority: "critical",
      title: "Run managed background pass",
      rationale: "Background worker is unhealthy and needs immediate execution check.",
      action: "run-background-once",
    });
  } else if (signals.workerHealth === "degraded") {
    pushUnique(recommendations, {
      id: "refresh-ops",
      priority: "medium",
      title: "Refresh ops snapshot",
      rationale: "Worker is degraded; refresh telemetry before further intervention.",
      action: "refresh-ops",
    });
  }

  if (signals.providerCircuitOpen) {
    pushUnique(recommendations, {
      id: "reset-circuits",
      priority: "high",
      title: "Reset provider circuits",
      rationale: "Provider circuit is open; clear memory after upstream recovery check.",
      action: "reset-circuits",
    });
  }

  if (signals.opsHealth === "red") {
    pushUnique(recommendations, {
      id: "trigger-alert-sweep",
      priority: "high",
      title: "Trigger alert sweep",
      rationale: "Ops health is red; force alert channels to confirm incident visibility.",
      action: "trigger-alert-sweep",
    });
  }

  return recommendations.sort((left, right) => {
    const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priorityDelta !== 0) return priorityDelta;
    return left.title.localeCompare(right.title);
  });
}
