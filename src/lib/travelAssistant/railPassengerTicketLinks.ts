/**
 * Per-passenger rail ticket links from forwarded PDF filenames.
 * Never invents passenger names — only from stored attachment filenames.
 */

import {
  buildSourceEmailViewPath,
  type ReservationSourceLink,
} from "@/lib/travelAssistant/reservationLinks";

export interface NamedPdfAttachment {
  filename: string;
  text?: string;
}

/** Stephanie-Russell-1980665325.pdf → "Stephanie Russell" */
export function extractPassengerNameFromPdfFilename(filename: string): string | null {
  const base = filename.trim().replace(/\.pdf$/iu, "");
  const match = base.match(/^(.+)-(\d{6,})$/u);
  if (!match?.[1]) return null;
  const name = match[1].replace(/-/gu, " ").replace(/\s+/gu, " ").trim();
  return name.length >= 3 ? name : null;
}

export function passengerSlugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function buildPassengerTicketSourceLinks(input: {
  pdfAttachments: NamedPdfAttachment[];
  tripId: string;
  reservationId: string;
}): ReservationSourceLink[] {
  const links: ReservationSourceLink[] = [];
  const seen = new Set<string>();

  for (const attachment of input.pdfAttachments) {
    const name = extractPassengerNameFromPdfFilename(attachment.filename);
    if (!name) continue;
    const slug = passengerSlugFromName(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    links.push({
      label: name,
      url: `${buildSourceEmailViewPath(input.tripId, input.reservationId)}&passenger=${encodeURIComponent(slug)}`,
      kind: "ticket",
    });
  }

  return links;
}

/** Merge passenger PDF links without dropping existing ticket links. */
export function mergePassengerTicketLinks(
  existing: ReservationSourceLink[] | undefined,
  passengerLinks: ReservationSourceLink[],
): ReservationSourceLink[] {
  if (passengerLinks.length === 0) return existing ?? [];
  const output = [...(existing ?? [])];
  const seenLabels = new Set(output.map((link) => link.label.trim().toLowerCase()));
  for (const link of passengerLinks) {
    const key = link.label.trim().toLowerCase();
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);
    output.push(link);
  }
  return output;
}
