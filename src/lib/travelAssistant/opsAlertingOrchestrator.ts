import { checkTravelOpsAlertEligibility, markTravelOpsAlertSent } from "@/lib/travelAssistant/opsAlertStateStore";
import { appendTravelOpsAlertAuditEntry } from "@/lib/travelAssistant/opsAlertAuditStore";
import { resolveTravelOpsNotifiersFromEnv, type TravelOpsNotifier } from "@/lib/travelAssistant/opsNotifiers";
import { buildTravelOpsSnapshot } from "@/lib/travelAssistant/opsSnapshot";
import type { TravelOpsAlertEvent, TravelOpsSnapshot } from "@/lib/travelAssistant/travelUpdateTypes";

const DEFAULT_ALERT_COOLDOWN_MS = 15 * 60_000;

function deriveAlerts(snapshot: TravelOpsSnapshot, nowIso: string, trigger: string): TravelOpsAlertEvent[] {
  const alerts: TravelOpsAlertEvent[] = [];
  if (snapshot.worker.health === "unhealthy") {
    alerts.push({
      key: "worker-unhealthy",
      severity: "critical",
      title: "Travel worker unhealthy",
      message: snapshot.worker.reasons[0] ?? "Background worker entered unhealthy state.",
      createdAt: nowIso,
      trigger,
    });
  }
  if (snapshot.worker.missedSchedule) {
    alerts.push({
      key: "worker-missed-schedule",
      severity: snapshot.worker.health === "unhealthy" ? "critical" : "warning",
      title: "Background schedule missed",
      message:
        snapshot.worker.minutesUntilExpectedRun !== null
          ? `Background run is ${Math.abs(snapshot.worker.minutesUntilExpectedRun)} minutes behind schedule.`
          : "Background run schedule drift detected.",
      createdAt: nowIso,
      trigger,
    });
  }
  if (snapshot.worker.consecutiveFailures >= 3) {
    alerts.push({
      key: "worker-consecutive-failures",
      severity: "critical",
      title: "Repeated background failures",
      message: `${snapshot.worker.consecutiveFailures} consecutive background failures detected.`,
      createdAt: nowIso,
      trigger,
    });
  }

  snapshot.governance.blockers
    .filter((blocker) => blocker.minimumStatus === "red")
    .forEach((blocker) => {
      alerts.push({
        key: `blocker-${blocker.code}`,
        severity: "critical",
        title: `Critical trip blocker: ${blocker.code}`,
        message: `${blocker.reason} ${blocker.remediation}`,
        createdAt: nowIso,
        trigger,
      });
    });

  return alerts;
}

export async function runTravelOpsAlertSweep({
  trigger,
  nowIso,
  cooldownMs = DEFAULT_ALERT_COOLDOWN_MS,
  notifiers,
  force = false,
  alertStatePath,
  alertAuditPath,
  snapshotOptions,
}: {
  trigger: string;
  nowIso?: string;
  cooldownMs?: number;
  notifiers?: TravelOpsNotifier[];
  force?: boolean;
  alertStatePath?: string;
  alertAuditPath?: string;
  snapshotOptions?: {
    runtimeStatePath?: string;
    auditPath?: string;
    backgroundStatePath?: string;
    opsAuditPath?: string;
    auditLimit?: number;
  };
}): Promise<{
  evaluatedAt: string;
  totalAlerts: number;
  sentAlerts: number;
  suppressedAlerts: number;
  deliveryErrors: number;
  alerts: TravelOpsAlertEvent[];
  sweepId: string;
}> {
  const evaluatedAt = nowIso ?? new Date().toISOString();
  const snapshot = await buildTravelOpsSnapshot({ nowIso: evaluatedAt, ...snapshotOptions });
  const alerts = deriveAlerts(snapshot, evaluatedAt, trigger);
  const notifierList = notifiers ?? resolveTravelOpsNotifiersFromEnv();

  let sentAlerts = 0;
  let suppressedAlerts = 0;
  let deliveryErrors = 0;

  for (const alert of alerts) {
    const eligibility = force
      ? { eligible: true, lastSentAt: null as string | null }
      : await checkTravelOpsAlertEligibility({
          alertKey: alert.key,
          nowIso: evaluatedAt,
          cooldownMs,
          storagePath: alertStatePath,
        });
    if (!eligibility.eligible) {
      suppressedAlerts += 1;
      continue;
    }

    const results = await Promise.all(notifierList.map((notifier) => notifier.send({ alert })));
    const hadSuccess = results.some((result) => result.ok);
    if (hadSuccess) {
      sentAlerts += 1;
      await markTravelOpsAlertSent({ alertKey: alert.key, sentAt: evaluatedAt, storagePath: alertStatePath });
    } else {
      deliveryErrors += 1;
    }
  }

  const audit = await appendTravelOpsAlertAuditEntry({
    evaluatedAt,
    trigger,
    totalAlerts: alerts.length,
    sentAlerts,
    suppressedAlerts,
    deliveryErrors,
    alerts,
    storagePath: alertAuditPath,
  });

  return {
    evaluatedAt,
    totalAlerts: alerts.length,
    sentAlerts,
    suppressedAlerts,
    deliveryErrors,
    alerts,
    sweepId: audit.id,
  };
}
