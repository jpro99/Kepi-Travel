/**
 * Live flight status is available when AeroDataBox and/or FlightAware is configured.
 * FlightAware (authorityRank 3) wins in merge when both return (F12).
 */

import { resolveAeroDataBoxApiKey } from "@/lib/travelAssistant/flightStatusSources/aeroDataBoxSource";
import { resolveFlightAwareApiKey } from "@/lib/travelAssistant/flightStatusSources/flightAwareSource";

export function hasLiveFlightStatusCredentials(): boolean {
  return Boolean(resolveAeroDataBoxApiKey() || resolveFlightAwareApiKey());
}

export function liveFlightStatusCredentialLabel(): string {
  const adb = Boolean(resolveAeroDataBoxApiKey());
  const fa = Boolean(resolveFlightAwareApiKey());
  if (fa && adb) return "FlightAware + AeroDataBox";
  if (fa) return "FlightAware";
  if (adb) return "AeroDataBox";
  return "none";
}
