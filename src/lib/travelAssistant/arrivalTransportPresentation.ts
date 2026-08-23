import type { ArrivalTransportOption } from "@/lib/travelAssistant/airportNavigation";
import { getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import {
  parseFlightArrivalUtcMs,
  resolveFcoArrivalTransportAdvice,
} from "@/lib/travelAssistant/fcoLeonardoExpressSchedule";

export interface ArrivalTransportPresentation {
  transportOptions: ArrivalTransportOption[];
  scheduleNote: string | null;
  rideStepTitle?: string;
  rideStepIcon?: string;
  rideStepDetail?: string;
}

export function resolveArrivalTransportPresentation(input: {
  iata: string;
  flightArrivalTime?: string | null;
  flightTimezone?: string | null;
  landedMinutesAgo?: number | null;
  hotelLabel?: string | null;
  nowMs?: number;
}): ArrivalTransportPresentation | null {
  const code = input.iata.trim().toUpperCase();
  const nav = getAirportNav(code);
  const baseOptions = nav?.arrivalInfo?.transportOptions;
  if (!baseOptions?.length) return null;

  if (code !== "FCO") {
    return {
      transportOptions: baseOptions,
      scheduleNote: null,
      rideStepTitle: nav?.arrivalInfo?.rideStepTitle,
      rideStepIcon: nav?.arrivalInfo?.rideStepIcon,
      rideStepDetail: nav?.arrivalInfo?.groundTransport,
    };
  }

  const arrivalUtcMs = parseFlightArrivalUtcMs({
    flightArrivalTime: input.flightArrivalTime,
    arrivalIata: code,
    flightTimezone: input.flightTimezone,
  });
  const advice = resolveFcoArrivalTransportAdvice({
    arrivalUtcMs,
    landedMinutesAgo: input.landedMinutesAgo,
    nowMs: input.nowMs,
    hotelLabel: input.hotelLabel,
    baseOptions,
    baseGroundTransport: nav?.arrivalInfo?.groundTransport ?? "",
    baseRideStepTitle: nav?.arrivalInfo?.rideStepTitle,
  });

  return {
    transportOptions: advice.transportOptions,
    scheduleNote: advice.scheduleNote,
    rideStepTitle: advice.rideStepTitle,
    rideStepIcon: advice.rideStepIcon,
    rideStepDetail: advice.rideStepDetail,
  };
}
