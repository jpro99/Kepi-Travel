export interface SharedHotelContact {
  hotelName: string;
  provider: string;
  address: string;
  phone: string;
  phoneTelHref: string | null;
  checkInLabel: string;
  checkOutLabel: string;
  checkInTimeLabel: string;
  roomType: string;
  confirmationCode: string;
  mapsQuery: string;
  mapsUrl: string;
}

export interface SharedHotelReservationInput {
  type: string;
  title: string;
  provider: string;
  localTime: string;
  location: string;
  confirmationCode: string;
  checkOutDate?: string;
  roomType?: string;
  hotelPhone?: string;
  notes?: string;
}

const PHONE_PATTERNS = [
  /\b(?:phone|tel(?:ephone)?|call|mobile|front desk|reception)\s*[:\-]?\s*(\+?\d[\d\s().-]{7,}\d)\b/iu,
  /\b(\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3}[\s.-]?\d{3,4})\b/u,
  /\b(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/u,
];

const ADDRESS_PATTERNS = [
  /\b(?:address|property address|hotel address)\s*[:\-]\s*([^\n|]+)/iu,
];

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/gu, "").trim();
}

function phoneToTelHref(phone: string): string | null {
  const normalized = normalizePhone(phone);
  if (normalized.length < 7) return null;
  return `tel:${normalized.startsWith("+") ? normalized : normalized}`;
}

export function extractPhoneFromText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  for (const pattern of PHONE_PATTERNS) {
    const match = trimmed.match(pattern);
    const candidate = match?.[1]?.trim() ?? "";
    if (candidate && normalizePhone(candidate).length >= 7) {
      return candidate;
    }
  }
  return "";
}

export function extractAddressFromText(text: string): string {
  for (const pattern of ADDRESS_PATTERNS) {
    const match = text.match(pattern);
    const candidate = match?.[1]?.trim() ?? "";
    if (candidate.length > 6) return candidate;
  }
  return "";
}

function formatHotelDate(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value.trim());
  if (!iso) return value.trim();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(iso[2]) - 1] ?? iso[2]} ${Number(iso[3])}, ${iso[1]}`;
}

function formatCheckInTime(localTime: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/u.exec(localTime.trim());
  if (!match?.[2]) return "";
  const [hourRaw, minute] = match[2].split(":");
  const hour = Number.parseInt(hourRaw ?? "", 10);
  if (Number.isNaN(hour)) return match[2];
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${meridiem}`;
}

export function buildSharedHotelContact(reservation: SharedHotelReservationInput): SharedHotelContact {
  const hotelName = reservation.title.trim() || reservation.provider.trim() || "Hotel";
  const provider = reservation.provider.trim();
  const notes = reservation.notes?.trim() ?? "";
  const address =
    reservation.location.trim() ||
    extractAddressFromText(notes) ||
    "";
  const phone =
    reservation.hotelPhone?.trim() ||
    extractPhoneFromText(notes) ||
    "";
  const mapsQuery = [hotelName, provider, address].filter(Boolean).join(", ");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;

  return {
    hotelName,
    provider,
    address,
    phone,
    phoneTelHref: phone ? phoneToTelHref(phone) : null,
    checkInLabel: reservation.localTime.trim() ? formatHotelDate(reservation.localTime) : "—",
    checkOutLabel: reservation.checkOutDate?.trim() ? formatHotelDate(reservation.checkOutDate) : "—",
    checkInTimeLabel: formatCheckInTime(reservation.localTime),
    roomType: reservation.roomType?.trim() || "",
    confirmationCode: reservation.confirmationCode.trim(),
    mapsQuery,
    mapsUrl,
  };
}
