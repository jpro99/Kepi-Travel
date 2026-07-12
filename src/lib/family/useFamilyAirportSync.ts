"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JourneyPhaseId } from "@/lib/airportNav/journeyMachine";
import type { GroupBoardingPressure } from "@/lib/airportNav/groupBoardingMath";
import type { FamilyAirportSyncDocument, FamilyRallyTarget } from "@/lib/family/familyAirportSync";

interface UseFamilyAirportSyncOptions {
  tripId: string | null;
  groupId: string | null;
  minutesToDeparture: number | null;
}

export function useFamilyAirportSync({
  tripId,
  groupId,
  minutesToDeparture,
}: UseFamilyAirportSyncOptions) {
  const [sync, setSync] = useState<FamilyAirportSyncDocument | null>(null);
  const [groupBoarding, setGroupBoarding] = useState<GroupBoardingPressure | null>(null);
  const [busy, setBusy] = useState(false);
  const tripIdRef = useRef(tripId);
  const groupIdRef = useRef(groupId);
  const minutesToDepartureRef = useRef(minutesToDeparture);

  useEffect(() => {
    tripIdRef.current = tripId;
    groupIdRef.current = groupId;
  }, [tripId, groupId]);

  useEffect(() => {
    minutesToDepartureRef.current = minutesToDeparture;
  }, [
    minutesToDeparture == null
      ? null
      : Number.isFinite(minutesToDeparture)
        ? Math.round(minutesToDeparture)
        : null,
  ]);

  const refresh = useCallback(async () => {
    const activeTripId = tripIdRef.current;
    const activeGroupId = groupIdRef.current;
    if (!activeTripId || !activeGroupId) return;
    const params = new URLSearchParams({ tripId: activeTripId, groupId: activeGroupId });
    const mins = minutesToDepartureRef.current;
    if (mins != null && Number.isFinite(mins)) {
      params.set("minutesToDeparture", String(Math.round(mins)));
    }
    const res = await fetch(`/api/family/airport-sync?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      sync?: FamilyAirportSyncDocument;
      groupBoarding?: GroupBoardingPressure | null;
    };
    setSync(data.sync ?? null);
    setGroupBoarding(data.groupBoarding ?? null);
  }, []);

  useEffect(() => {
    if (!tripId || !groupId) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(id);
  }, [tripId, groupId, refresh]);

  const postAction = useCallback(
    async (body: Record<string, unknown>) => {
      if (!tripId || !groupId) return false;
      setBusy(true);
      try {
        const res = await fetch("/api/family/airport-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...body,
            tripId,
            groupId,
            minutesToDeparture: minutesToDeparture ?? undefined,
          }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as {
          sync?: FamilyAirportSyncDocument;
          groupBoarding?: GroupBoardingPressure | null;
        };
        setSync(data.sync ?? null);
        setGroupBoarding(data.groupBoarding ?? null);
        return true;
      } finally {
        setBusy(false);
      }
    },
    [tripId, groupId, minutesToDeparture],
  );

  const setPhase = useCallback(
    (phase: JourneyPhaseId) => postAction({ action: "set-phase", phase }),
    [postAction],
  );

  const setRally = useCallback(
    (target: FamilyRallyTarget, message?: string) =>
      postAction({ action: "set-rally", target, message }),
    [postAction],
  );

  const cancelRally = useCallback(() => postAction({ action: "cancel-rally" }), [postAction]);

  return { sync, groupBoarding, setPhase, setRally, cancelRally, busy, refresh };
}
