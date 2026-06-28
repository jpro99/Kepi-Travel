/** Booked airport hops used to detect when a direct planned leg is already satisfied via connections. */
export interface ItineraryPathSegment {
  fromCode: string;
  toCode: string;
  booked: boolean;
  departMs?: number | null;
}

function normalizeCode(code: string | undefined): string {
  return code?.trim().toUpperCase() ?? "";
}

function bookedHops(segments: ItineraryPathSegment[]): ItineraryPathSegment[] {
  return segments.filter(
    (segment) =>
      segment.booked &&
      normalizeCode(segment.fromCode) &&
      normalizeCode(segment.toCode) &&
      normalizeCode(segment.fromCode) !== "???",
  );
}

/** Shortest booked airport path (BFS), or null when none exists. */
export function findBookedAirportPath(
  segments: ItineraryPathSegment[],
  fromCode: string,
  toCode: string,
  maxHops = 8,
): string[] | null {
  const from = normalizeCode(fromCode);
  const to = normalizeCode(toCode);
  if (!from || !to) return null;
  if (from === to) return [from];

  const hops = bookedHops(segments);
  const adjacency = new Map<string, string[]>();
  for (const hop of hops) {
    const dep = normalizeCode(hop.fromCode);
    const arr = normalizeCode(hop.toCode);
    if (!adjacency.has(dep)) adjacency.set(dep, []);
    adjacency.get(dep)!.push(arr);
  }

  const queue: string[] = [from];
  const parent = new Map<string, string | null>([[from, null]]);
  const depth = new Map<string, number>([[from, 0]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const hopsSoFar = depth.get(current) ?? 0;
    if (current === to) {
      const path: string[] = [];
      let node: string | null = current;
      while (node) {
        path.unshift(node);
        node = parent.get(node) ?? null;
      }
      return path;
    }
    if (hopsSoFar >= maxHops) continue;

    for (const next of adjacency.get(current) ?? []) {
      if (parent.has(next)) continue;
      parent.set(next, current);
      depth.set(next, hopsSoFar + 1);
      queue.push(next);
    }
  }

  return null;
}

export function hasBookedAirportPath(
  segments: ItineraryPathSegment[],
  fromCode: string,
  toCode: string,
): boolean {
  return findBookedAirportPath(segments, fromCode, toCode) !== null;
}

export function describeBookedAirportPath(
  segments: ItineraryPathSegment[],
  fromCode: string,
  toCode: string,
): string | null {
  const path = findBookedAirportPath(segments, fromCode, toCode);
  if (!path || path.length < 2) return null;
  return path.join("→");
}

export function legDepartureAlignedWithBookedPath(
  segments: ItineraryPathSegment[],
  fromCode: string,
  legDate: string | undefined,
  toleranceDays = 1,
): boolean {
  if (!legDate?.trim()) return true;
  const from = normalizeCode(fromCode);
  const targetMs = Date.parse(`${legDate.trim().slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(targetMs)) return true;

  const outbound = bookedHops(segments).filter((hop) => normalizeCode(hop.fromCode) === from);
  if (outbound.length === 0) return false;

  return outbound.some((hop) => {
    if (hop.departMs == null || !Number.isFinite(hop.departMs)) return true;
    const diffDays = Math.abs(hop.departMs - targetMs) / 86_400_000;
    return diffDays <= toleranceDays;
  });
}

/** True when booked hops already get the traveler from A to B on the planned date. */
export function isDirectLegCoveredByConnections(args: {
  fromCode: string;
  toCode: string;
  legDate?: string;
  segments: ItineraryPathSegment[];
}): boolean {
  const from = normalizeCode(args.fromCode);
  const to = normalizeCode(args.toCode);
  if (!from || !to || from === to) return true;
  if (!hasBookedAirportPath(args.segments, from, to)) return false;
  return legDepartureAlignedWithBookedPath(args.segments, from, args.legDate);
}
