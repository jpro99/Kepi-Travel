"use client";

interface MobileTripShellHeaderProps {
  tripName: string;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

function formatTripDates(start: string, end: string): string {
  const fmt = (value: string): string => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
    if (!match) return "";
    return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  const startLabel = fmt(start);
  const endLabel = fmt(end);
  if (!startLabel && !endLabel) return "";
  if (startLabel && endLabel && start !== end) return `${startLabel} – ${endLabel}`;
  return startLabel || endLabel;
}

export function MobileTripShellHeader({
  tripName,
  destination,
  startDate,
  endDate,
}: MobileTripShellHeaderProps) {
  const dates = formatTripDates(startDate ?? "", endDate ?? "");

  return (
    <header className="mb-1">
      <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
        {tripName}
      </h1>
      {(destination || dates) ? (
        <p className="mt-1 text-[15px] text-[var(--text-secondary)]">
          {[destination || null, dates || null].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </header>
  );
}
