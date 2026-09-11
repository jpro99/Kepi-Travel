/**
 * CEO gospel — Sep 12, 2026 Bari→Venice travel day (J7HBM5).
 * Two passengers × two train legs + BRI→VCE flight. Do not invent beyond this.
 */

import {
  buildPassengerTicketSourceLinks,
  type NamedPdfAttachment,
} from "@/lib/travelAssistant/railPassengerTicketLinks";
import type { ReservationSourceLink } from "@/lib/travelAssistant/reservationLinks";
import { formatNamedPdfSection } from "@/lib/travelAssistant/emailSourceText";

export const BARI_VENICE_TRIP_ID = "trip-europe-2026";

export const STEPHANIE_PDF_FILENAME = "Stephanie-Russell-1980665325.pdf";
export const JEFFERY_PDF_FILENAME = "Jeffery Paul-Russell-1980665325.pdf";

export const TRENITALIA_STEPHANIE_PDF_TEXT = `
TRENITALIA
Codice prenotazione J7HBM5
Frecciargento 8312
PASSEGGERO Stephanie Russell
BIGLIETTO 2922705405
COACH 1 POSTO 2C
PARTENZA
Lecce
12/09/2026 09:35
ARRIVO
Bari Centrale
12/09/2026 10:56
Regionale 91312
PARTENZA
BARI C.LE FNB
12/09/2026 11:20
ARRIVO
BARI AEROPORTO KAROL WOJTYLA
12/09/2026 11:36
`.trim();

export const TRENITALIA_JEFFERY_PDF_TEXT = `
TRENITALIA
Codice prenotazione J7HBM5
Frecciargento 8312
PASSEGGERO Jeffery Paul Russell
BIGLIETTO 2922705406
COACH 1 POSTO 2D
PARTENZA
Lecce
12/09/2026 09:35
ARRIVO
Bari Centrale
12/09/2026 10:56
Regionale 91312
PARTENZA
BARI C.LE FNB
12/09/2026 11:20
ARRIVO
BARI AEROPORTO KAROL WOJTYLA
12/09/2026 11:36
`.trim();

export const BARI_VENICE_PDF_ATTACHMENTS: NamedPdfAttachment[] = [
  { filename: STEPHANIE_PDF_FILENAME, text: TRENITALIA_STEPHANIE_PDF_TEXT },
  { filename: JEFFERY_PDF_FILENAME, text: TRENITALIA_JEFFERY_PDF_TEXT },
];

export function buildBariVeniceStoredSourceText(): string {
  return BARI_VENICE_PDF_ATTACHMENTS
    .map((pdf) => formatNamedPdfSection(pdf.filename, pdf.text ?? ""))
    .join("\n\n");
}

function passengerLinksForLeg(reservationId: string): ReservationSourceLink[] {
  return buildPassengerTicketSourceLinks({
    pdfAttachments: BARI_VENICE_PDF_ATTACHMENTS,
    tripId: BARI_VENICE_TRIP_ID,
    reservationId,
  });
}

export const BARI_VENICE_SEP_12_RESERVATIONS = [
  {
    id: "lecce-stay",
    type: "hotel",
    title: "Lecce stay",
    provider: "Airbnb",
    localTime: "2026-09-08",
    checkOutDate: "2026-09-12",
    location: "Lecce, Italy",
    hotelSearchCity: "Lecce",
    timezone: "Europe/Rome",
  },
  {
    id: "train-fa8312-lecce-bari",
    type: "train",
    title: "Frecciargento 8312",
    provider: "Trenitalia",
    trainNumber: "8312",
    localTime: "2026-09-12 09:35",
    location: "Lecce → Bari Centrale",
    confirmationCode: "J7HBM5",
    timezone: "Europe/Rome",
    hasPdfAttachment: true,
    originalEmailText: buildBariVeniceStoredSourceText(),
    sourceLinks: passengerLinksForLeg("train-fa8312-lecce-bari"),
  },
  {
    id: "train-reg91312-bari-airport",
    type: "train",
    title: "Regionale 91312",
    provider: "Trenitalia",
    trainNumber: "91312",
    localTime: "2026-09-12 11:20",
    location: "Bari Centrale FNB → Bari Aeroporto",
    confirmationCode: "J7HBM5",
    timezone: "Europe/Rome",
    hasPdfAttachment: true,
    originalEmailText: buildBariVeniceStoredSourceText(),
    sourceLinks: passengerLinksForLeg("train-reg91312-bari-airport"),
  },
  {
    id: "flight-bri-vce",
    type: "flight",
    title: "ITA Airways",
    provider: "ITA Airways",
    confirmationCode: "Z84T4Z",
    localTime: "2026-09-12 15:20",
    flightDate: "2026-09-12",
    flightDepartureTime: "2026-09-12 15:20",
    flightArrivalTime: "2026-09-12 18:25",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "VCE",
    flightArrivalTerminal: "1",
    flightNumber: "AZ1464",
    timezone: "Europe/Rome",
  },
  {
    id: "venice-airbnb",
    type: "hotel",
    title: "Venice Airbnb",
    provider: "Airbnb",
    localTime: "2026-09-12",
    checkOutDate: "2026-09-15",
    location: "Venice",
    hotelSearchCity: "Venice",
    timezone: "Europe/Rome",
  },
] as const;
