/** West Coast award gateways — where partner J space often opens before SoCal feeders. */

export const WEST_COAST_AWARD_GATEWAYS = ["SEA", "SFO", "LAX"] as const;

export const SOCAL_LOCAL_AIRPORTS = new Set(["ONT", "LAX", "SNA", "BUR", "SAN", "PSP", "LGB"]);

export function resolveAwardSearchOrigins(localOrigins: string[]): {
  locals: string[];
  gateways: string[];
  all: string[];
} {
  const locals = [...new Set(localOrigins.map((o) => o.toUpperCase()))].slice(0, 6);
  const isSoCal = locals.some((o) => SOCAL_LOCAL_AIRPORTS.has(o));
  const gateways = isSoCal
    ? WEST_COAST_AWARD_GATEWAYS.filter((g) => !locals.includes(g))
    : [];
  const all = [...new Set([...locals, ...gateways])].slice(0, 8);
  return { locals, gateways, all };
}

export function resolveCashSearchOrigins(localOrigins: string[]): string[] {
  return [...new Set(localOrigins.map((o) => o.toUpperCase()))].slice(0, 6);
}

export function isGatewayAirport(iata: string): boolean {
  return (WEST_COAST_AWARD_GATEWAYS as readonly string[]).includes(iata.toUpperCase());
}

/** Miles-community label for reposition-to-gateway award plays. */
export function gatewayPlayTitle(gateway: string, feederOrigin?: string): string {
  const g = gateway.toUpperCase();
  if (g === "SEA") {
    return feederOrigin ? "West Coast Gateway Play" : "Seattle Sweet Spot";
  }
  if (g === "SFO") return "Bay Gateway Play";
  if (g === "LAX") return "LAX Gateway Play";
  return `${g} Gateway Play`;
}

export function gatewayPlayHeadline(
  gateway: string,
  destination: string,
  program: string,
  miles: number,
  feederOrigin?: string,
): string {
  const title = gatewayPlayTitle(gateway, feederOrigin);
  const route = feederOrigin ? `${feederOrigin} → ${gateway} → ${destination}` : `${gateway} → ${destination}`;
  return `${title}: ${route} · ${miles.toLocaleString()} ${program} mi`;
}
