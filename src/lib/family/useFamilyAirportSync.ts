"use client";

import { useCallback, useEffect, useState } from "react";
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

  const refresh = useCallback(async () => {
    if (!tripId || !groupId) return;
    const params = new URLSearchParams({ tripId, groupId });
    if (minutesToDeparture != null && Number.isFinite(minutesToDeparture)) {
      params.set("minutesToDeparture", String(Math.round(minutesToDeparture)));
    }
    const res = await fetch(`/api/family/airport-sync?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      sync?: FamilyAirportSyncDocument;
      groupBoarding?: GroupBoardingPressure | null;
    };
    setSync(data.sync ?? null);
    setGroupBoarding(data.groupBoarding ?? null);
  }, [tripId, groupId, minutesToDeparture]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

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
