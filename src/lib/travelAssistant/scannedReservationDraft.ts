export type ScannedReservationType = "flight" | "hotel" | "train" | "ride" | "dinner";

export interface ScannedReservationDraft {
  type: ScannedReservationType;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  assignedTo: string[];
  stage: "airport" | "arrival" | "readiness";
  critical: boolean;
  confidence: "medium";
  notes: string;
  flightNumber: string;
  flightAirline: string;
  flightDate: string;
  flightDepartureAirport: string;
  flightArrivalAirport: string;
  checkOutDate: string;
  roomType: string;
  quotedPriceUsd?: number;
  quotedPointsMiles?: number;
  quotedMilesEarned?: number;
  pointsProgram?: string;
}

export function normalizeScannedReservationType(rawType: unknown): ScannedReservationType {
  if (typeof rawType !== "string") {
    return "ride";
  }
  const normalized = rawType.trim().toLowerCase();
  if (normalized === "flight" || normalized === "hotel" || normalized === "train" || normalized === "ride") {
    return normalized;
  }
  if (normalized === "restaurant" || normalized === "meal" || normalized === "dining" || normalized === "dinner") {
    return "dinner";
  }
  if (normalized === "car" || normalized === "rental" || normalized === "taxi" || normalized === "transfer") {
    return "ride";
  }
  return "ride";
}

export function normalizeScannedDate(rawDate: string): string {
  const trimmed = rawDate.trim();
  if (!trimmed) {
    return "";
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/u.exec(trimmed);
  if (slashMatch) {
    const month = Number.parseInt(slashMatch[1] ?? "", 10);
    const day = Number.parseInt(slashMatch[2] ?? "", 10);
    const yearRaw = slashMatch[3] ?? "";
    const year = Number.parseInt(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw, 10);
    if (!Number.isNaN(month) && !Number.isNaN(day) && !Number.isNaN(year)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return "";
  }
  const date = new Date(parsed);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function normalizeScannedTime(rawTime: string): string {
  const trimmed = rawTime.trim();
  if (!trimmed) {
    return "";
  }
  const twelveHourMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/iu.exec(trimmed);
  if (twelveHourMatch) {
    let hour = Number.parseInt(twelveHourMatch[1] ?? "", 10);
    const minute = Number.parseInt(twelveHourMatch[2] ?? "", 10);
    const meridiem = (twelveHourMatch[3] ?? "").toUpperCase();
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return "";
    }
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const twentyFourHourMatch = /^(\d{1,2}):(\d{2})$/u.exec(trimmed);
  if (twentyFourHourMatch) {
    const hour = Number.parseInt(twentyFourHourMatch[1] ?? "", 10);
    const minute = Number.parseInt(twentyFourHourMatch[2] ?? "", 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return "";
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return "";
}

function defaultStageForScannedType(type: ScannedReservationType): "airport" | "arrival" | "readiness" {
  if (type === "flight" || type === "train") {
    return "airport";
  }
  if (type === "hotel" || type === "ride") {
    return "arrival";
  }
  return "readiness";
}

export function buildScannedReservationDraft(reservationNode: Record<string, unknown>): ScannedReservationDraft {
  const scannedType = normalizeScannedReservationType(reservationNode.type);
  const provider = typeof reservationNode.provider === "string" ? reservationNode.provider.trim() : "";
  const title = typeof reservationNode.title === "string" ? reservationNode.title.trim() : "";
  const date = normalizeScannedDate(typeof reservationNode.date === "string" ? reservationNode.date : "");
  const time = normalizeScannedTime(typeof reservationNode.time === "string" ? reservationNode.time : "");
  const timezone =
    typeof reservationNode.timezone === "string" && reservationNode.timezone.trim().length > 0
      ? reservationNode.timezone.trim()
      : "Etc/UTC";
  const confirmationCode =
    typeof reservationNode.confirmationCode === "string" ? reservationNode.confirmationCode.trim() : "";
  const location = typeof reservationNode.location === "string" ? reservationNode.location.trim() : "";
  const numberValue =
    typeof reservationNode.flightOrTrainNumber === "string"
      ? reservationNode.flightOrTrainNumber.trim()
      : typeof reservationNode.flightNumber === "string"
        ? reservationNode.flightNumber.trim()
        : typeof reservationNode.trainNumber === "string"
          ? reservationNode.trainNumber.trim()
          : "";
  const departureAirport =
    typeof reservationNode.departureAirport === "string"
      ? reservationNode.departureAirport.trim().toUpperCase().slice(0, 4)
      : "";
  const arrivalAirport =
    typeof reservationNode.arrivalAirport === "string"
      ? reservationNode.arrivalAirport.trim().toUpperCase().slice(0, 4)
      : "";
  const localTime =
    typeof reservationNode.localTime === "string" && reservationNode.localTime.trim().length > 0
      ? reservationNode.localTime.trim()
      : date && time
        ? `${date} ${time}`
        : date
          ? `${date} 12:00`
          : "";
  const notes = typeof reservationNode.notes === "string" ? reservationNode.notes.trim() : "";
  const roomType = typeof reservationNode.roomType === "string" ? reservationNode.roomType.trim() : "";
  const checkOutDate = normalizeScannedDate(
    typeof reservationNode.checkOutDate === "string" ? reservationNode.checkOutDate : "",
  );
  const quotedPriceUsdRaw =
    typeof reservationNode.cashUsd === "number"
      ? reservationNode.cashUsd
      : typeof reservationNode.quotedPriceUsd === "number"
        ? reservationNode.quotedPriceUsd
        : undefined;
  const quotedPointsMilesRaw =
    typeof reservationNode.pointsMiles === "number"
      ? reservationNode.pointsMiles
      : typeof reservationNode.quotedPointsMiles === "number"
        ? reservationNode.quotedPointsMiles
        : undefined;
  const quotedMilesEarnedRaw =
    typeof reservationNode.milesEarned === "number"
      ? reservationNode.milesEarned
      : typeof reservationNode.quotedMilesEarned === "number"
        ? reservationNode.quotedMilesEarned
        : undefined;
  const pointsProgram =
    typeof reservationNode.pointsProgram === "string" ? reservationNode.pointsProgram.trim() : "";

  return {
    type: scannedType,
    title: title || `${provider || "Scanned"} reservation`,
    provider: provider || title || (scannedType === "hotel" ? "Hotel" : scannedType === "flight" ? "Flight" : "Reservation"),
    localTime,
    timezone,
    location,
    confirmationCode,
    assignedTo: [],
    stage: defaultStageForScannedType(scannedType),
    critical: scannedType === "flight" || scannedType === "train" || scannedType === "ride",
    confidence: "medium",
    notes,
    flightNumber: scannedType === "flight" ? numberValue : "",
    flightAirline: scannedType === "flight" ? provider : "",
    flightDate: scannedType === "flight" ? date : "",
    flightDepartureAirport: scannedType === "flight" ? departureAirport : "",
    flightArrivalAirport: scannedType === "flight" ? arrivalAirport : "",
    checkOutDate: scannedType === "hotel" ? checkOutDate : "",
    roomType: scannedType === "hotel" ? roomType : "",
    quotedPriceUsd:
      typeof quotedPriceUsdRaw === "number" && Number.isFinite(quotedPriceUsdRaw) && quotedPriceUsdRaw > 0
        ? Math.round(quotedPriceUsdRaw)
        : undefined,
    quotedPointsMiles:
      typeof quotedPointsMilesRaw === "number" && Number.isFinite(quotedPointsMilesRaw) && quotedPointsMilesRaw > 0
        ? Math.round(quotedPointsMilesRaw)
        : undefined,
    quotedMilesEarned:
      typeof quotedMilesEarnedRaw === "number" && Number.isFinite(quotedMilesEarnedRaw) && quotedMilesEarnedRaw > 0
        ? Math.round(quotedMilesEarnedRaw)
        : undefined,
    pointsProgram: pointsProgram || undefined,
  };
}

export function parseScannedReservationJson(modelText: string): ScannedReservationDraft {
  const jsonStart = modelText.indexOf("{");
  const jsonEnd = modelText.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error("Ticket scan model returned an invalid response.");
  }
  const parsed = JSON.parse(modelText.slice(jsonStart, jsonEnd + 1)) as unknown;
  const root = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const reservationNode =
    root.reservation && typeof root.reservation === "object" && !Array.isArray(root.reservation)
      ? (root.reservation as Record<string, unknown>)
      : root;
  return buildScannedReservationDraft(reservationNode);
}

/** Vercel serverless body limit is ~4.5MB — stay under it for mobile PDF uploads. */
export const CONFIRMATION_SCAN_MAX_BYTES = 4 * 1024 * 1024;

export function isConfirmationScanUpload(file: File): boolean {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return true;
  }
  return file.type.startsWith("image/");
}

export function confirmationScanKind(file: File): "pdf" | "image" {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }
  return "image";
}
