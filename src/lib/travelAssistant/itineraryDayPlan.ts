/** Structured per-day itinerary edits — persisted on trip + localStorage mirror. */

export interface DayPlanRecord {
  location: string;
  hotelName: string;
  hotelConfirmation: string;
  hotelBooked: boolean;
  notes: string;
  /** Word day subtitle — e.g. BEST VIEWPOINTS on Sept 4 (I47). */
  dayHeading?: string;
}

export interface LetterStayHeader {
  title?: string;
  lines: string[];
  stayLocation?: string;
  stayAddress?: string;
}

export interface ItineraryPlansData {
  dayPlans: Record<string, DayPlanRecord>;
  legLabelOverrides: Record<string, string>;
  updatedAt: string;
  /** Stay facts from a forwarded Word letter — always visible on Plan (I47). */
  letterHeader?: LetterStayHeader;
}

export const EMPTY_DAY_PLAN = (location = ""): DayPlanRecord => ({
  location,
  hotelName: "",
  hotelConfirmation: "",
  hotelBooked: false,
  notes: "",
  dayHeading: "",
});

export function emptyItineraryPlans(): ItineraryPlansData {
  return { dayPlans: {}, legLabelOverrides: {}, updatedAt: new Date().toISOString() };
}

export function normalizeItineraryPlans(raw: unknown): ItineraryPlansData {
  if (!raw || typeof raw !== "object") return emptyItineraryPlans();
  const record = raw as Partial<ItineraryPlansData>;
  const dayPlans: Record<string, DayPlanRecord> = {};
  if (record.dayPlans && typeof record.dayPlans === "object") {
    for (const [key, value] of Object.entries(record.dayPlans)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Partial<DayPlanRecord>;
      dayPlans[key] = {
        location: typeof v.location === "string" ? v.location : "",
        hotelName: typeof v.hotelName === "string" ? v.hotelName : "",
        hotelConfirmation: typeof v.hotelConfirmation === "string" ? v.hotelConfirmation : "",
        hotelBooked: Boolean(v.hotelBooked),
        notes: typeof v.notes === "string" ? v.notes : "",
        dayHeading: typeof v.dayHeading === "string" ? v.dayHeading : "",
      };
    }
  }
  const legLabelOverrides: Record<string, string> = {};
  if (record.legLabelOverrides && typeof record.legLabelOverrides === "object") {
    for (const [key, value] of Object.entries(record.legLabelOverrides)) {
      if (typeof value === "string" && value.trim()) legLabelOverrides[key] = value.trim();
    }
  }
  const rawHeader = (record as { letterHeader?: unknown }).letterHeader;
  let letterHeader: LetterStayHeader | undefined;
  if (rawHeader && typeof rawHeader === "object") {
    const header = rawHeader as Partial<LetterStayHeader>;
    const lines = Array.isArray(header.lines)
      ? header.lines.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
      : [];
    if (lines.length > 0 || (typeof header.title === "string" && header.title.trim())) {
      letterHeader = {
        title: typeof header.title === "string" ? header.title.trim() : undefined,
        lines,
        stayLocation: typeof header.stayLocation === "string" ? header.stayLocation : undefined,
        stayAddress: typeof header.stayAddress === "string" ? header.stayAddress : undefined,
      };
    }
  }

  return {
    dayPlans,
    legLabelOverrides,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    letterHeader,
  };
}

/** Legacy dayNotes line format for backward compatibility. */
export function dayPlanToNote(plan: DayPlanRecord): string {
  const lines: string[] = [];
  if (plan.location.trim()) lines.push(`Stay in ${plan.location.trim()}`);
  if (plan.hotelBooked && plan.hotelName.trim()) {
    const conf = plan.hotelConfirmation.trim();
    lines.push(conf ? `Hotel: ${plan.hotelName.trim()} (${conf})` : `Hotel: ${plan.hotelName.trim()}`);
  }
  if (plan.notes.trim()) lines.push(plan.notes.trim());
  return lines.join("\n");
}

export function parseDayPlanFromNote(note: string, fallbackLocation: string): DayPlanRecord {
  const plan = EMPTY_DAY_PLAN(fallbackLocation);
  const lines = note.split(/\r?\n/u).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const stayMatch = /^stay in (.+)$/iu.exec(line);
    if (stayMatch?.[1]) {
      plan.location = stayMatch[1].trim();
      continue;
    }
    const hotelMatch = /^hotel:\s*(.+?)(?:\s*\(([^)]+)\))?$/iu.exec(line);
    if (hotelMatch?.[1]) {
      plan.hotelName = hotelMatch[1].trim();
      plan.hotelConfirmation = hotelMatch[2]?.trim() ?? "";
      plan.hotelBooked = true;
      continue;
    }
    plan.notes = plan.notes ? `${plan.notes}\n${line}` : line;
  }
  if (!plan.location) plan.location = fallbackLocation;
  return plan;
}

export function mergeDayPlan(existing: DayPlanRecord | undefined, fallbackLocation: string): DayPlanRecord {
  return existing ?? EMPTY_DAY_PLAN(fallbackLocation);
}

export function displayHotelForDay(args: {
  plan: DayPlanRecord | undefined;
  reservationHotel: string | null;
}): { label: string; booked: boolean } {
  if (args.plan?.hotelBooked && args.plan.hotelName.trim()) {
    return { label: args.plan.hotelName.trim(), booked: true };
  }
  if (args.reservationHotel) {
    return { label: args.reservationHotel, booked: true };
  }
  return { label: "", booked: false };
}
