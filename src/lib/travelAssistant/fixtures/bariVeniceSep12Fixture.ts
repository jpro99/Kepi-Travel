/**
 * CEO gospel — Sep 12, 2026 Bari→Venice travel day (J7HBM5 + Z84T4Z).
 * Two passengers × two train legs + ITA BRI→VCE 15:20–18:25, 1 stop, VCE T1.
 * No verified flight number on ticket — never invent AZ1464 or any other flight number.
 */

import {
  buildFlightBoardingPassSourceLink,
  formatBoardingPassPdfFilename,
} from "@/lib/travelAssistant/flightBoardingPassIngest";
import {
  buildPassengerTicketSourceLinks,
  type NamedPdfAttachment,
} from "@/lib/travelAssistant/railPassengerTicketLinks";
import type { ReservationSourceLink } from "@/lib/travelAssistant/reservationLinks";
import type { FlightBoardingPassSourceReservation } from "@/lib/travelAssistant/flightBoardingPassStored";
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

export const ITA_STEPHANIE_BRI_FCO_BOARDING_TEXT = `
ITA Airways Boarding Pass
Passenger: Stephanie Russell
Reservation code Z84T4Z
BRI - FCO
12/09/2026
`.trim();

export const ITA_JEFFERY_BRI_FCO_BOARDING_TEXT = `
ITA Airways Boarding Pass
Passenger: Jeffery Paul Russell
Reservation code Z84T4Z
BRI - FCO
12/09/2026
`.trim();

/** Gospel — Stephanie FCO→VCE boarding pass email 1a09187ec57078ad (2026-09-11). invent=0 */
export const ITA_STEPHANIE_FCO_VCE_BOARDING_TEXT = `
ITA Airways Boarding Pass
Passenger: RUSSELL, STEPHANIE MRS
Booking code: Z84T4Z
Ticket number: 0552116012180
Flight: AZ 1467 · FCO → VCE · 12SEP26 · 17:20–18:25
Terminal 1 · Boarding 16:50 · Gate closes 17:05
Seat 6D · Boarding Group 4 · Gate A00
Baggage: 1 personal + 1 carry-on 8kg + 1×23kg
`.trim();

export const ITA_JEFFERY_FCO_VCE_BOARDING_TEXT = `
ITA Airways Boarding Pass
Passenger: RUSSELL, JEFFERY MR
Booking code: Z84T4Z
Flight: AZ 1467 · FCO → VCE · 12SEP26 · 17:20–18:25
Terminal 1 · Boarding 16:50 · Gate closes 17:05
Seat 6E · Boarding Group 4 · Gate A00
Baggage: 1 personal + 1 carry-on 8kg + 1×23kg
`.trim();

function boardingPassSections(): string {
  return boardingPassSectionsForRoutes([...ALL_BOARDING_ROUTES]);
}

function flightBoardingPassLinks(routes: Array<{ dep: string; arr: string }>): ReservationSourceLink[] {
  const reservationId = "flight-bri-vce";
  const passengers = ["Stephanie Russell", "Jeffery Paul Russell"];
  const links: ReservationSourceLink[] = [];
  for (const route of routes) {
    for (const passengerName of passengers) {
      links.push(
        buildFlightBoardingPassSourceLink({
          tripId: BARI_VENICE_TRIP_ID,
          reservationId,
          passengerName,
          route,
        }),
      );
    }
  }
  return links;
}

function boardingPassSectionsForRoutes(routes: Array<{ dep: string; arr: string }>): string {
  const sections: string[] = [];
  const stephanieTexts: Record<string, string> = {
    "BRI-FCO": ITA_STEPHANIE_BRI_FCO_BOARDING_TEXT,
    "FCO-VCE": ITA_STEPHANIE_FCO_VCE_BOARDING_TEXT,
  };
  const jefferyTexts: Record<string, string> = {
    "BRI-FCO": ITA_JEFFERY_BRI_FCO_BOARDING_TEXT,
    "FCO-VCE": ITA_JEFFERY_FCO_VCE_BOARDING_TEXT,
  };
  for (const route of routes) {
    const key = `${route.dep}-${route.arr}`;
    sections.push(
      formatNamedPdfSection(
        formatBoardingPassPdfFilename("Stephanie Russell", route),
        stephanieTexts[key] ?? "",
      ),
      formatNamedPdfSection(
        formatBoardingPassPdfFilename("Jeffery Paul Russell", route),
        jefferyTexts[key] ?? "",
      ),
    );
  }
  return sections.filter(Boolean).join("\n\n");
}

const ALL_BOARDING_ROUTES = [
  { dep: "BRI", arr: "FCO" },
  { dep: "FCO", arr: "VCE" },
] as const;

/** Partial ingest — FCO→VCE only until BRI→FCO is forwarded to trips. */
export const PARTIAL_BOARDING_ROUTES = [{ dep: "FCO", arr: "VCE" }] as const;

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

export const BARI_VENICE_SEP_12_RESERVATIONS: FlightBoardingPassSourceReservation[] = [
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
    flightConnectionStops: 1,
    timezone: "Europe/Rome",
    hasPdfAttachment: true,
    originalEmailText: boardingPassSections(),
    sourceLinks: flightBoardingPassLinks([...ALL_BOARDING_ROUTES]),
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
];

/** CEO partial state — FCO→VCE boarding passes ingested; BRI→FCO still missing. */
export const BARI_VENICE_PARTIAL_BOARDING_RESERVATIONS: FlightBoardingPassSourceReservation[] =
  BARI_VENICE_SEP_12_RESERVATIONS.map((row) => {
  if (row.id !== "flight-bri-vce") return row;
  return {
    ...row,
    originalEmailText: boardingPassSectionsForRoutes([...PARTIAL_BOARDING_ROUTES]),
    sourceLinks: flightBoardingPassLinks([...PARTIAL_BOARDING_ROUTES]),
  };
});
