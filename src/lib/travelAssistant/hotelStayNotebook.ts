import {
  parseDayLinesForEditor,
  serializeDayLinesForEditor,
} from "@/lib/travelAssistant/dayPlanLines";

export interface HotelNotebookReservation {
  id: string;
  title: string;
  provider?: string;
  location?: string;
  localTime?: string;
  checkOutDate?: string;
  confirmationCode?: string;
}

function fmtShort(iso: string): string {
  const slice = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slice)) return "";
  return new Date(`${slice}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function hotelBookedLineText(reservation: HotelNotebookReservation): string {
  const name = reservation.title?.trim() || reservation.provider?.trim() || "Hotel";
  const city = reservation.location?.trim();
  const inDate = fmtShort(reservation.localTime ?? "");
  const outDate = fmtShort(reservation.checkOutDate ?? "");
  const dates =
    inDate && outDate ? `${inDate} – ${outDate}` : inDate ? `from ${inDate}` : outDate ? `until ${outDate}` : "";
  const conf = reservation.confirmationCode?.trim();
  return [name, city, dates, conf ? `#${conf}` : ""].filter(Boolean).join(" · ");
}

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function filterHotelUserLines(savedNote: string, bookedTexts: string[]): string[] {
  const bookedNorm = new Set(bookedTexts.map((t) => normalizeForCompare(t)));
  return parseDayLinesForEditor(savedNote).filter((line) => {
    const norm = normalizeForCompare(line);
    if (!norm) return false;
    for (const booked of bookedNorm) {
      if (norm === booked || norm.includes(booked) || booked.includes(norm)) return false;
    }
    return true;
  });
}

export function serializeHotelNotebook(lines: string[]): string {
  return serializeDayLinesForEditor(lines);
}
