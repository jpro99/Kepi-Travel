export type ReservationSourceLinkKind =
  | "manage"
  | "ticket"
  | "checkin"
  | "directions"
  | "menu"
  | "email"
  | "other";

export interface ReservationSourceLink {
  label: string;
  url: string;
  kind: ReservationSourceLinkKind;
}

export interface ReservationLinkInput {
  type: string;
  provider?: string;
  location?: string;
  confirmationCode?: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDate?: string;
  localTime?: string;
  manageUrl?: string;
  sourceLinks?: ReservationSourceLink[];
  sourceEmailId?: string;
  originalEmailText?: string;
  hasPdfAttachment?: boolean;
}

const SKIP_URL_HOSTS = new Set([
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "linkedin.com",
  "unsubscribe",
  "click.email",
  "trk.",
  "utm_",
]);

const ANCHOR_RULES: Array<{ kind: ReservationSourceLinkKind; pattern: RegExp; label: string }> = [
  { kind: "ticket", pattern: /boarding pass|mobile boarding|e-?ticket|view ticket|print ticket|wallet pass/i, label: "Boarding pass / ticket" },
  { kind: "checkin", pattern: /check.?in|web check.?in|online check.?in/i, label: "Check in" },
  { kind: "manage", pattern: /manage (?:your )?(?:booking|reservation|trip)|view (?:booking|itinerary|reservation)|my trip|trip details|modify booking/i, label: "Manage booking" },
  { kind: "menu", pattern: /view menu|modify reservation|opentable|resy|tock|seventable/i, label: "Restaurant reservation" },
  { kind: "directions", pattern: /get directions|view map|open in maps/i, label: "Directions" },
];

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/[>,\])}"']+$/u, "");
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if ([...SKIP_URL_HOSTS].some((skip) => host.includes(skip) || trimmed.toLowerCase().includes(skip))) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function labelForUrl(url: string, kind: ReservationSourceLinkKind, anchorText?: string): string {
  const text = anchorText?.trim();
  if (text && text.length >= 4 && text.length <= 48 && !/^https?:/iu.test(text)) return text;
  return ANCHOR_RULES.find((rule) => rule.kind === kind)?.label ?? "Open link";
}

function extractAnchorsFromHtml(html: string): Array<{ url: string; text: string }> {
  if (!html.trim()) return [];
  const results: Array<{ url: string; text: string }> = [];
  const anchorPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu;
  let match: RegExpExecArray | null = anchorPattern.exec(html);
  while (match) {
    const url = normalizeUrl(match[1] ?? "");
    if (url) {
      const text = (match[2] ?? "").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
      results.push({ url, text });
    }
    match = anchorPattern.exec(html);
  }
  return results;
}

function extractPlainUrls(text: string): string[] {
  const pattern = /https?:\/\/[^\s<>"']+/giu;
  return [...text.matchAll(pattern)]
    .map((match) => normalizeUrl(match[0] ?? ""))
    .filter((url): url is string => Boolean(url));
}

function classifyAnchor(text: string, url: string): ReservationSourceLinkKind {
  const haystack = `${text} ${url}`.toLowerCase();
  for (const rule of ANCHOR_RULES) {
    if (rule.pattern.test(haystack)) return rule.kind;
  }
  if (/maps\.google|google\.com\/maps|maps\.apple|waze\.com/iu.test(url)) return "directions";
  if (/opentable|resy|tock|seventable|exploretock/iu.test(url)) return "menu";
  if (/airline|fly|boarding|checkin|manage/iu.test(haystack)) return "manage";
  return "other";
}

/** Pull actionable booking links out of forwarded confirmation email bodies. */
export function extractReservationSourceLinks(input: {
  text?: string;
  html?: string;
  type?: string;
}): ReservationSourceLink[] {
  const links: ReservationSourceLink[] = [];
  const seen = new Set<string>();

  const add = (url: string, kind: ReservationSourceLinkKind, label: string): void => {
    if (seen.has(url)) return;
    seen.add(url);
    links.push({ url, kind, label });
  };

  for (const anchor of extractAnchorsFromHtml(input.html ?? "")) {
    const kind = classifyAnchor(anchor.text, anchor.url);
    if (kind === "other" && anchor.text.length < 3) continue;
    add(anchor.url, kind, labelForUrl(anchor.url, kind, anchor.text));
  }

  for (const url of extractPlainUrls(`${input.text ?? ""}\n${input.html ?? ""}`)) {
    const kind = classifyAnchor("", url);
    add(url, kind, labelForUrl(url, kind));
  }

  return links.slice(0, 6);
}

function airlineManageUrl(airline: string, confirmationCode: string): string | null {
  const lower = airline.toLowerCase();
  const code = confirmationCode.trim();
  if (!code) return null;
  if (lower.includes("alaska")) return `https://www.alaskaair.com/booking/reservation-lookup?recordLocator=${encodeURIComponent(code)}`;
  if (lower.includes("united")) return `https://www.united.com/en/us/checkin`;
  if (lower.includes("american") || lower === "aa") return `https://www.aa.com/checkin/`;
  if (lower.includes("delta")) return `https://www.delta.com/my-trips/search`;
  if (lower.includes("southwest")) return `https://www.southwest.com/air/check-in/`;
  if (lower.includes("jetblue")) return `https://www.jetblue.com/check-in`;
  if (lower.includes("hawaiian")) return `https://www.hawaiianairlines.com/my-trip/login`;
  return null;
}

function mapsDirectionsUrl(location: string): string | null {
  const query = location.trim();
  if (query.length < 4) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function flightLookupUrl(reservation: ReservationLinkInput): string | null {
  const flightNumber = reservation.flightNumber?.replace(/\s+/gu, "").trim();
  const date = reservation.flightDate?.slice(0, 10) || reservation.localTime?.slice(0, 10);
  if (!flightNumber || flightNumber === "Not booked yet") return null;
  const query = date ? `${flightNumber} ${date}` : flightNumber;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}

/** Merge stored import links with smart fallbacks for older reservations. */
export function buildReservationQuickLinks(reservation: ReservationLinkInput): ReservationSourceLink[] {
  const links: ReservationSourceLink[] = [];
  const seen = new Set<string>();

  const add = (link: ReservationSourceLink): void => {
    if (!link.url || seen.has(link.url)) return;
    seen.add(link.url);
    links.push(link);
  };

  if (reservation.manageUrl) {
    add({ label: "Manage booking", url: reservation.manageUrl, kind: "manage" });
  }

  for (const stored of reservation.sourceLinks ?? []) {
    add(stored);
  }

  if (reservation.type === "flight") {
    const airline = reservation.flightAirline || reservation.provider || "";
    const manage = airlineManageUrl(airline, reservation.confirmationCode ?? "");
    if (manage) add({ label: "Airline manage / check-in", url: manage, kind: "checkin" });
    const flightLookup = flightLookupUrl(reservation);
    if (flightLookup) add({ label: "Flight status", url: flightLookup, kind: "other" });
  }

  if (reservation.type === "hotel" && reservation.confirmationCode?.trim()) {
    const provider = reservation.provider?.trim();
    if (provider) {
      add({
        label: `Find ${provider} confirmation`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`${provider} ${reservation.confirmationCode}`)}`,
        kind: "manage",
      });
    }
  }

  if (reservation.type === "dinner") {
    const directions = mapsDirectionsUrl(reservation.location ?? reservation.provider ?? "");
    if (directions) add({ label: "Directions", url: directions, kind: "directions" });
  }

  if (reservation.location?.trim() && reservation.type !== "dinner") {
    const directions = mapsDirectionsUrl(reservation.location);
    if (directions) add({ label: "Directions", url: directions, kind: "directions" });
  }

  return links.slice(0, 5);
}

/** Prefer stored pass URL, then ticket links from import metadata or email body. */
export function resolveBoardingPassUrl(input: {
  boardingPassUrl?: string;
  sourceLinks?: ReservationSourceLink[];
  originalEmailText?: string;
  html?: string;
}): string | undefined {
  const direct = input.boardingPassUrl?.trim();
  if (direct) return direct;

  const fromStored = input.sourceLinks?.find((link) => link.kind === "ticket")?.url?.trim();
  if (fromStored) return fromStored;

  const extracted = extractReservationSourceLinks({
    text: input.originalEmailText,
    html: input.html,
  });
  const fromEmail = extracted.find((link) => link.kind === "ticket")?.url?.trim();
  if (fromEmail) return fromEmail;

  for (const url of extractPlainUrls(input.originalEmailText ?? "")) {
    const lower = url.toLowerCase();
    if (lower.endsWith(".pkpass") || lower.includes("wallet") || lower.includes("passbook")) {
      return url;
    }
  }
  return undefined;
}

export function reservationHasSourceEmail(reservation: ReservationLinkInput): boolean {
  return Boolean(
    reservation.sourceEmailId?.trim() ||
      reservation.originalEmailText?.trim() ||
      reservation.hasPdfAttachment,
  );
}

export function buildSourceEmailViewPath(tripId: string, reservationId: string): string {
  return `/api/reservations/source-view?tripId=${encodeURIComponent(tripId)}&reservationId=${encodeURIComponent(reservationId)}`;
}
