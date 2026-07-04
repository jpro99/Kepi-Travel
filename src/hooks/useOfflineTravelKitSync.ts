"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionReadinessItem, SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import {
  buildOfflineTravelKit,
  formatOfflineKitSavedAt,
  loadOfflineTravelKit,
  saveOfflineTravelKit,
  type OfflineTravelKit,
} from "@/lib/travelAssistant/offlineTravelKit";
import type { TripAirportTransport } from "@/lib/travelAssistant/tripStore";

interface UseOfflineTravelKitSyncArgs {
  tripId: string | null;
  tripName: string;
  destination: string;
  startDate: string;
  endDate: string;
  airportTransport: TripAirportTransport | null;
  hotelArrivalTime: string | null;
  reservations: SessionReservation[];
  readinessItems: SessionReadinessItem[];
  dayNotes: Record<string, string>;
  hotelNotebookNote: string;
  enabled?: boolean;
}

export interface OfflineTravelKitSyncState {
  kit: OfflineTravelKit | null;
  savedAtLabel: string | null;
  syncing: boolean;
  refreshFromDb: () => Promise<void>;
  forceSync: () => Promise<void>;
}

export function useOfflineTravelKitSync(args: UseOfflineTravelKitSyncArgs): OfflineTravelKitSyncState {
  const [kit, setKit] = useState<OfflineTravelKit | null>(null);
  const [syncing, setSyncing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const enabled = args.enabled ?? true;

  const refreshFromDb = useCallback(async (): Promise<void> => {
    const loaded = await loadOfflineTravelKit();
    setKit(loaded);
  }, []);

  const forceSync = useCallback(async (): Promise<void> => {
    if (!enabled || !args.tripId || args.reservations.length === 0) {
      return;
    }
    setSyncing(true);
    try {
      const nextKit = buildOfflineTravelKit({
        tripId: args.tripId,
        tripName: args.tripName,
        destination: args.destination,
        startDate: args.startDate,
        endDate: args.endDate,
        airportTransport: args.airportTransport,
        hotelArrivalTime: args.hotelArrivalTime,
        reservations: args.reservations,
        readinessItems: args.readinessItems,
        dayNotes: args.dayNotes,
        hotelNotebookNote: args.hotelNotebookNote,
      });
      await saveOfflineTravelKit(nextKit);
      setKit(nextKit);
    } finally {
      setSyncing(false);
    }
  }, [
    args.airportTransport,
    args.dayNotes,
    args.destination,
    args.endDate,
    args.hotelArrivalTime,
    args.hotelNotebookNote,
    args.readinessItems,
    args.reservations,
    args.startDate,
    args.tripId,
    args.tripName,
    enabled,
  ]);

  useEffect(() => {
    void refreshFromDb();
  }, [refreshFromDb]);

  useEffect(() => {
    if (!enabled || !args.tripId || args.reservations.length === 0) {
      return;
    }
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      void forceSync();
    }, 600);
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [
    args.airportTransport,
    args.dayNotes,
    args.destination,
    args.endDate,
    args.hotelArrivalTime,
    args.hotelNotebookNote,
    args.readinessItems,
    args.reservations,
    args.startDate,
    args.tripId,
    args.tripName,
    enabled,
    forceSync,
  ]);

  return {
    kit,
    savedAtLabel: kit ? formatOfflineKitSavedAt(kit.savedAt) : null,
    syncing,
    refreshFromDb,
    forceSync,
  };
}
