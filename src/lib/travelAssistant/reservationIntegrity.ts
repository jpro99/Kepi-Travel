export type ReservationIntegrityIssueCode =
  | "missing-title"
  | "missing-provider"
  | "missing-location"
  | "missing-confirmation"
  | "invalid-timezone"
  | "invalid-local-time";

export interface ReservationIntegrityIssue {
  code: ReservationIntegrityIssueCode;
  message: string;
  remediation: string;
}

export interface ReservationDraftLike {
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
}

function isValidTimezone(timezone: string): boolean {
  if (!timezone || !timezone.includes("/")) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function isStrictDateTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const [, y, m, d, hh, mm] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const hour = Number(hh);
  const minute = Number(mm);
  if (
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return false;
  }
  const parsed = Date.parse(`${y}-${m}-${d}T${hh}:${mm}:00Z`);
  return !Number.isNaN(parsed);
}

export function evaluateReservationIntegrity(input: ReservationDraftLike): {
  safeForLive: boolean;
  issues: ReservationIntegrityIssue[];
} {
  const issues: ReservationIntegrityIssue[] = [];

  if (!input.title.trim()) {
    issues.push({
      code: "missing-title",
      message: "Reservation title is missing.",
      remediation: "Add a clear itinerary title before promoting to live trip.",
    });
  }
  if (!input.provider.trim()) {
    issues.push({
      code: "missing-provider",
      message: "Reservation provider is missing.",
      remediation: "Add provider/carrier/vendor information.",
    });
  }
  if (!input.location.trim()) {
    issues.push({
      code: "missing-location",
      message: "Reservation location is missing.",
      remediation: "Add terminal/platform/address location details.",
    });
  }
  if (!input.confirmationCode.trim()) {
    issues.push({
      code: "missing-confirmation",
      message: "Confirmation code is missing.",
      remediation: "Add a confirmation/reference code before activation.",
    });
  }
  if (!isValidTimezone(input.timezone.trim())) {
    issues.push({
      code: "invalid-timezone",
      message: `Timezone "${input.timezone}" is invalid or non-canonical.`,
      remediation: "Use a canonical IANA timezone (e.g. America/New_York).",
    });
  }
  if (!isStrictDateTime(input.localTime.trim())) {
    issues.push({
      code: "invalid-local-time",
      message: `Local time "${input.localTime}" is invalid or missing minutes.`,
      remediation: "Use strict format YYYY-MM-DD HH:MM with a valid value.",
    });
  }

  return {
    safeForLive: issues.length === 0,
    issues,
  };
}
