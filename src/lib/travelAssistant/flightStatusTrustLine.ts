/**
 * Honest status line for Home next-flight card (Batch 1 / F13 trust).
 */

export type FlightStatusTrustInput = {
  flightStatus?: string;
  departureGate?: string;
  delayMinutes?: number | null;
  checkedAt?: string;
  busy?: boolean;
  error?: string | null;
};

export function formatFlightStatusTrustLine(
  status: FlightStatusTrustInput | undefined,
  now: Date = new Date(),
): string | null {
  if (!status) {
    return "Status not checked yet — tap Check status on the flight.";
  }
  if (status.busy) {
    return "Checking live status…";
  }
  if (status.error?.trim()) {
    return status.error.trim();
  }

  const parts: string[] = [];
  const gate = status.departureGate?.trim();
  if (gate) parts.push(`Gate ${gate}`);

  const raw = (status.flightStatus ?? "").trim();
  if (raw) {
    parts.push(raw);
  } else if (!gate) {
    parts.push("No live status yet");
  }

  if (typeof status.delayMinutes === "number" && status.delayMinutes > 0) {
    parts.push(`+${status.delayMinutes} min`);
  }

  const checkedAt = status.checkedAt?.trim();
  if (checkedAt) {
    const ms = Date.parse(checkedAt);
    if (!Number.isNaN(ms)) {
      const minutesAgo = Math.max(0, Math.round((now.getTime() - ms) / 60_000));
      if (minutesAgo <= 1) parts.push("Updated just now");
      else if (minutesAgo < 60) parts.push(`Updated ${minutesAgo} min ago`);
      else parts.push(`Updated ${Math.round(minutesAgo / 60)}h ago`);
    }
  }

  return parts.join(" · ");
}
