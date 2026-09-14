/**
 * FCO connecting itinerary fixture — Z84T4Z BRI→FCO→VCE (Sep 12, 2026).
 * Connector legs only; no gates on confirmation (invent=0 regression lock).
 * Source: travelDayFlightView.test.ts LIVE_Z84T4Z_CONNECTOR_LEGS.
 */

export const FCO_CONNECTION_SEP_12_RESERVATIONS = [
  {
    id: "z84-bri-fco",
    type: "flight",
    title: "BRI-FCO",
    provider: "ITA Airways",
    confirmationCode: "Z84T4Z",
    flightNumber: "AZ1616",
    localTime: "2026-09-12 10:00",
    timezone: "Europe/Rome",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "FCO",
    flightDepartureTime: "2026-09-12 10:00",
    flightArrivalTime: "2026-09-12 11:15",
    flightDate: "2026-09-12",
  },
  {
    id: "z84-fco-vce",
    type: "flight",
    title: "FCO-VCE",
    provider: "ITA Airways",
    confirmationCode: "Z84T4Z",
    flightNumber: "AZ1467",
    localTime: "2026-09-12 12:00",
    timezone: "Europe/Rome",
    flightDepartureAirport: "FCO",
    flightArrivalAirport: "VCE",
    flightDepartureTime: "2026-09-12 12:00",
    flightArrivalTime: "2026-09-12 18:25",
    flightArrivalTerminal: "1",
    flightDate: "2026-09-12",
  },
] as const;

/** Intl inbound at FCO for passport-step regression — no gates invented. */
export const FCO_INTL_CONNECTION_RESERVATIONS = [
  {
    id: "jfk-fco-in",
    type: "flight",
    localTime: "2026-09-10 11:00",
    timezone: "Europe/Rome",
    flightDepartureAirport: "JFK",
    flightArrivalAirport: "FCO",
    flightDepartureTime: "2026-09-10 08:00",
    flightArrivalTime: "2026-09-10 11:00",
    flightDate: "2026-09-10",
    flightNumber: "AA100",
    confirmationCode: "ABC123",
  },
  {
    id: "fco-bri-out",
    type: "flight",
    localTime: "2026-09-10 14:00",
    timezone: "Europe/Rome",
    flightDepartureAirport: "FCO",
    flightArrivalAirport: "BRI",
    flightDepartureTime: "2026-09-10 14:00",
    flightArrivalTime: "2026-09-10 15:00",
    flightDate: "2026-09-10",
    flightNumber: "AZ1234",
    confirmationCode: "ABC123",
  },
] as const;
