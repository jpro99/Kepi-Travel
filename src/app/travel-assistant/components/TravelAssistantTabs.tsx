// @ts-nocheck
"use client";

import { useMemo, useState } from 'react';
import { ItineraryTab } from "@/components/travelAssistant/ItineraryTab";
import { FamilyPanel } from "@/components/travelAssistant/FamilyPanel";
import { HomeSentryPanel } from "./HomeSentryPanel";
import { AirportNavigator } from "@/components/airport/AirportNavigator";
import { defaultSeaFlight } from "@/lib/airportNav/airportNavigatorEngine";
import { normalizeAirportIata } from "@/lib/airportNav/layouts";
import { BioRhythmCard } from './BioRhythmCard';
import { FortificationCard } from './FortificationCard';

import { useRouter } from 'next/navigation';

export function TravelAssistantTabs({ fortification, bioPlan, reservations, tripStage, guidanceUserLat, guidanceUserLon, addReservation, deleteReservation, lastFamilyLocationSentAt, activeTripId }) {
    const [activeTab, setActiveTab] = useState("itinerary");
    const router = useRouter();

    const handleExpensesClick = () => {
        router.push(`/expenses?tripId=${activeTripId}`);
    };

    const handleBookClick = () => {
        router.push('/book');
    };

    const flightReservation = reservations.find((r) => r.type === "flight");
    const airportFlight = useMemo(() => {
        const base = defaultSeaFlight();
        if (!flightReservation) return base;
        return {
            ...base,
            airline: flightReservation.provider || "United",
            gateCode: flightReservation.location.split("Gate ")[1] || base.gateCode,
            flightNumber: flightReservation.confirmationCode || base.flightNumber,
            originIata: normalizeAirportIata(flightReservation.location),
        };
    }, [flightReservation]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-6 gap-1 rounded-full bg-slate-200 p-1 dark:bg-slate-800">
                <button onClick={handleBookClick} className={`rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700/50`}>Book</button>
                <button onClick={() => setActiveTab("itinerary")} className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === "itinerary" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700/50"}`}>Itinerary</button>
                <button onClick={() => setActiveTab("map")} className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === "map" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700/50"}`}>Map</button>
                <button onClick={() => setActiveTab("home")} className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === "home" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700/50"}`}>Home</button>
                <button onClick={handleExpensesClick} className={`rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700/50`}>Expenses</button>
                <button onClick={() => setActiveTab("more")} className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === "more" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-700/50"}`}>More</button>
            </div>
            {activeTab === "itinerary" && (
                <>
                    {fortification && <FortificationCard fortification={fortification} />}
                    {bioPlan && <BioRhythmCard plan={bioPlan} />}
                    <ItineraryTab 
                        reservations={reservations}
                        onAddReservation={addReservation}
                        onDeleteReservation={deleteReservation}
                    />
                </>
            )}
            {activeTab === "map" && (
                tripStage === 'airport' && flightReservation ? (
                    <div className="h-[min(72vh,640px)] min-h-[480px] w-full overflow-hidden rounded-3xl bg-[#0B1F3A] shadow-lg">
                        <AirportNavigator
                            className="h-full min-h-[480px] rounded-none border-0 shadow-none"
                            iata={normalizeAirportIata(flightReservation.location)}
                            flight={airportFlight}
                        />
                    </div>
                ) : (
                    <div className="rounded-3xl bg-white p-6 shadow-lg dark:bg-slate-900">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Map</h2>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">The map is available when you are at the airport.</p>
                    </div>
                )
            )}
            {activeTab === "home" && <HomeSentryPanel />}
            {activeTab === "more" && (
                <FamilyPanel 
                    isPremium={true} 
                    onUpgrade={() => {}} 
                    lastSentAt={lastFamilyLocationSentAt}
                />
            )}
        </div>
    );
}
