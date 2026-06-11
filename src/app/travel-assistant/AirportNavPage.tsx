"use client";

import { AirportNavigator, type AirportNavigatorProps } from "@/components/airport/AirportNavigator";
import { defaultSeaFlight } from "@/lib/airportNav/airportNavigatorEngine";
import { normalizeAirportIata } from "@/lib/airportNav/layouts";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export function AirportNavPage() {
  const searchParams = useSearchParams();

  const navigatorProps = useMemo((): AirportNavigatorProps => {
    const iata = normalizeAirportIata(searchParams.get("iata") ?? "SEA");
    const gate = searchParams.get("gate");
    const airline = searchParams.get("airline") ?? "United";
    const flightNumber = searchParams.get("flight") ?? "UA1182";

    const base = defaultSeaFlight();
    return {
      iata,
      tripId: searchParams.get("tripId") ?? undefined,
      flight: {
        ...base,
        flightNumber,
        airline,
        gateCode: gate ?? base.gateCode,
        originIata: iata,
      },
    };
  }, [searchParams]);

  return (
    <main className="min-h-screen bg-[#0B1F3A] px-3 py-4 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="px-1">
          <h1 className="text-lg font-semibold text-white">Kepi Airport Navigator</h1>
          <p className="text-sm text-slate-400">
            Voice-first 3D terminal co-pilot — tap bubbles, guide me, or hold the mic.
          </p>
        </header>
        <AirportNavigator {...navigatorProps} />
      </div>
    </main>
  );
}
