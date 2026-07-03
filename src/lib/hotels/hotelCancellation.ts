export interface HotelCancellationSummary {
  cancellable: boolean;
  /** Short label for cards and checkout */
  label: string;
  /** Longer copy for detail / checkout */
  detail: string;
  deadline?: string;
  penaltyUsd?: number;
}

interface CancelPolicyInfo {
  cancelTime?: string;
  amount?: number;
  currency?: string;
}

function parseCancelTime(value?: string): Date | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().replace(" ", "T");
  const parsed = new Date(`${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCancelDeadline(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function parseLiteApiCancellationPolicies(policies: unknown): HotelCancellationSummary | null {
  if (!policies || typeof policies !== "object") return null;

  const record = policies as Record<string, unknown>;
  const refundableTag = typeof record.refundableTag === "string" ? record.refundableTag.trim().toUpperCase() : "";
  const infos = Array.isArray(record.cancelPolicyInfos)
    ? (record.cancelPolicyInfos as CancelPolicyInfo[])
    : [];

  if (refundableTag === "NRFN") {
    return {
      cancellable: false,
      label: "Non-refundable",
      detail: "This rate is non-refundable. If you cancel, the full stay amount is not returned.",
    };
  }

  const freeUntil = infos.find((info) => (info.amount ?? 0) <= 0 && info.cancelTime);
  if (freeUntil?.cancelTime) {
    const deadline = parseCancelTime(freeUntil.cancelTime);
    const deadlineLabel = deadline ? formatCancelDeadline(deadline) : freeUntil.cancelTime;
    return {
      cancellable: true,
      label: "Free cancellation",
      detail: `Free cancellation until ${deadlineLabel}. After that, supplier cancellation rules apply.`,
      deadline: freeUntil.cancelTime,
    };
  }

  const firstPenalty = infos.find((info) => info.cancelTime);
  if (firstPenalty?.cancelTime) {
    const deadline = parseCancelTime(firstPenalty.cancelTime);
    const deadlineLabel = deadline ? formatCancelDeadline(deadline) : firstPenalty.cancelTime;
    const penaltyUsd =
      typeof firstPenalty.amount === "number" && Number.isFinite(firstPenalty.amount)
        ? firstPenalty.amount
        : undefined;
    return {
      cancellable: refundableTag === "RFN" || penaltyUsd === 0,
      label: penaltyUsd && penaltyUsd > 0 ? "Cancellation fee applies" : "Refundable with conditions",
      detail:
        penaltyUsd && penaltyUsd > 0
          ? `Cancel before ${deadlineLabel} to avoid a ${firstPenalty.currency ?? "USD"} ${penaltyUsd.toFixed(0)} fee.`
          : `Cancellation terms apply — deadline ${deadlineLabel}.`,
      deadline: firstPenalty.cancelTime,
      penaltyUsd,
    };
  }

  if (refundableTag === "RFN") {
    return {
      cancellable: true,
      label: "Refundable",
      detail: "This rate is refundable under the supplier's cancellation rules.",
    };
  }

  return null;
}

export function resolveHotelCancellationCopy(input: {
  cancellable?: boolean;
  cancellationDeadline?: string;
  summary?: HotelCancellationSummary | null;
}): HotelCancellationSummary {
  if (input.summary) return input.summary;

  if (input.cancellationDeadline) {
    return {
      cancellable: true,
      label: "Free cancellation",
      detail: `Free cancellation until ${input.cancellationDeadline}.`,
      deadline: input.cancellationDeadline,
    };
  }

  if (input.cancellable) {
    return {
      cancellable: true,
      label: "Free cancellation",
      detail: "This search rate showed free cancellation — we confirm exact terms at checkout.",
    };
  }

  return {
    cancellable: false,
    label: "Check cancellation terms",
    detail: "Cancellation rules are set by the hotel and rate. We show the verified policy before you pay.",
  };
}
