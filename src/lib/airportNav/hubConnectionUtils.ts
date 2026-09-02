/**
 * Hub connection helpers — self-transfer vs through-ticket (G66).
 */

import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";

const NAME_TO_IATA: Record<string, string> = {
  UNITED: "UA",
  ALASKA: "AS",
  AMERICAN: "AA",
  DELTA: "DL",
  ITA: "AZ",
  AIRWAYS: "AZ",
  LUFTHANSA: "LH",
  BRITISH: "BA",
};

/** Best-effort airline IATA from flight number prefix or provider name. */
export function airlineIataFromReservation(
  res: Pick<TransportRouteReservation, "flightNumber" | "flightAirline" | "provider">,
): string | null {
  const fn = res.flightNumber?.trim().toUpperCase() ?? "";
  const fromNumber = fn.match(/^([A-Z0-9]{2})\d/u);
  if (fromNumber) return fromNumber[1]!;

  const name = `${res.flightAirline ?? ""} ${res.provider ?? ""}`.toUpperCase();
  for (const [token, iata] of Object.entries(NAME_TO_IATA)) {
    if (name.includes(token)) return iata;
  }
  return null;
}

export type BagsCheckReservation = Pick<
  TransportRouteReservation,
  "confirmationCode" | "flightNumber" | "flightAirline" | "provider"
>;

/**
 * Bags stay checked through only on the same confirmation AND same operating
 * carrier family — separate tickets / airline switches always require claim +
 * re-check at the outbound counter.
 */
export function inferBagsCheckedThrough(
  inbound: BagsCheckReservation,
  outbound: BagsCheckReservation,
): boolean {
  const inCode = inbound.confirmationCode?.trim();
  const outCode = outbound.confirmationCode?.trim();
  if (!inCode || !outCode || inCode !== outCode) return false;

  const inAir = airlineIataFromReservation(inbound);
  const outAir = airlineIataFromReservation(outbound);
  if (inAir && outAir && inAir !== outAir) return false;

  return true;
}
