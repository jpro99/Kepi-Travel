import { FAMILY_LOCATION_STALE_MS } from "@/lib/family/familyLocationWatch";
import { getAirportProximity, type UserAirportStatus } from "@/lib/travelAssistant/airportGeo";

export interface FamilyAirportPin {
  memberId: string;
  name: string;
  color: string;
  lat: number;
  lon: number;
  updatedAt: string;
  stale: boolean;
  proximityStatus: UserAirportStatus;
}

export interface FamilyMemberPinInput {
  id: string;
  name: string;
  color: string;
  sharingEnabled?: boolean;
}

export interface FamilyLocationPinInput {
  lat: number;
  lon: number;
  updatedAt: string;
}

/** Family members whose GPS places them at the departure airport (coarse geofence). */
export function buildFamilyAirportPins(
  members: FamilyMemberPinInput[],
  locations: Record<string, FamilyLocationPinInput | undefined>,
  airportIata: string,
  options?: { excludeMemberId?: string | null; requireSharing?: boolean },
): FamilyAirportPin[] {
  const code = airportIata.trim().toUpperCase();
  if (!code) return [];

  const exclude = options?.excludeMemberId ?? null;
  const requireSharing = options?.requireSharing ?? false;
  const pins: FamilyAirportPin[] = [];

  for (const member of members) {
    if (exclude && member.id === exclude) continue;
    if (requireSharing && member.sharingEnabled === false) continue;

    const loc = locations[member.id];
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) continue;

    const prox = getAirportProximity(loc.lat, loc.lon, code);
    if (prox.status !== "at-airport" && prox.status !== "in-terminal") continue;
    if (prox.airport?.iata !== code) continue;

    pins.push({
      memberId: member.id,
      name: member.name,
      color: member.color,
      lat: loc.lat,
      lon: loc.lon,
      updatedAt: loc.updatedAt,
      stale: Date.now() - Date.parse(loc.updatedAt) > FAMILY_LOCATION_STALE_MS,
      proximityStatus: prox.status,
    });
  }

  return pins;
}
