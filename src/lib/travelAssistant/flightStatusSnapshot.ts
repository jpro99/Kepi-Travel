export type FlightStatusSourceId = "aerodatabox" | "flightaware";

export interface FlightStatusSnapshot {
  source: FlightStatusSourceId;
  fetchedAtMs: number;
  flightNumber: string;
  flightDate: string;
  status: string;
  delayMinutes: number | null;
  departureGate: string;
  departureTerminal: string;
  departureAirport: string;
  arrivalAirport: string;
  authorityRank: number;
}

export interface FlightStatusSourceDiscrepancy {
  field: string;
  primary: string;
  secondary: string;
  primarySource: FlightStatusSourceId;
  secondarySource: FlightStatusSourceId;
}
