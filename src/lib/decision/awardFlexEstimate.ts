/** Deterministic award-mile estimates by date — not live inventory. */

const DAY_FACTORS = [1.06, 0.94, 0.86, 0.84, 0.91, 1.02, 1.08]; // Sun–Sat

function hashRouteDate(routeKey: string, dateIso: string): number {
  let h = 0;
  const s = `${routeKey}:${dateIso}`;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function roundMiles(value: number): number {
  return Math.max(12_500, Math.round(value / 2_500) * 2_500);
}

/**
 * Models typical partner-award swings (e.g. 55k–85k on the same route by day).
 * Verify on Seats.aero before booking — labeled "estimated" in UI.
 */
export function estimateAwardMiles(input: {
  baseMiles: number;
  origin: string;
  destination: string;
  departureDate: string;
  cabin?: "business" | "economy";
}): number {
  const d = new Date(`${input.departureDate}T12:00:00Z`);
  const dow = d.getUTCDay();
  const dayOfMonth = d.getUTCDate();
  const routeKey = `${input.origin}-${input.destination}-${input.cabin ?? "business"}`;
  const hash = hashRouteDate(routeKey, input.departureDate);
  const hashFactor = 1 - (hash % 9) * 0.018;
  const dowFactor = DAY_FACTORS[dow] ?? 1;
  const monthWave = 1 + Math.sin(((dayOfMonth - 12) / 9) * Math.PI) * 0.06;
  const raw = input.baseMiles * dowFactor * monthWave * hashFactor;
  return roundMiles(raw);
}

export function buildSeatsAeroSearchUrl(input: {
  origin: string;
  destination: string;
  departureDate: string;
}): string {
  const params = new URLSearchParams({
    origins: input.origin.toUpperCase(),
    destinations: input.destination.toUpperCase(),
    date: input.departureDate,
  });
  return `https://seats.aero/?${params.toString()}`;
}

export function formatDateShiftLabel(departureDate: string, shiftDays: number): string {
  const d = new Date(`${departureDate}T12:00:00Z`);
  const label = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  if (shiftDays === 0) return `${label} (your date)`;
  const sign = shiftDays > 0 ? "+" : "";
  return `${label} (${sign}${shiftDays}d)`;
}
