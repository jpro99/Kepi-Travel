import assert from "node:assert/strict";
import test from "node:test";
import { createOfflineOutboxSnapshot } from "@/lib/travelAssistant/offlineOutbox";
import {
  parseTravelClientSessionState,
  stringifyTravelClientSessionState,
  type TravelClientSessionSnapshot,
} from "@/lib/travelAssistant/clientSessionState";

function buildSnapshot(): TravelClientSessionSnapshot {
  return {
    version: 1,
    savedAt: "2026-06-21T10:00:00.000Z",
    tripStage: "pre-departure",
    tripStatus: "yellow",
    networkMode: "cellular",
    wifiOnlySync: true,
    allowCellularLocationUpdates: false,
    showFamilyMap: true,
    selectedFamilyMemberId: "alex",
    personalTimelineOnly: false,
    guidanceTone: "subtle",
    stageFocusMode: true,
    offlineOutbox: createOfflineOutboxSnapshot(),
    reservations: [
      {
        id: "res-1",
        type: "flight",
        title: "DL 407 JFK -> SFO",
        provider: "Delta",
        localTime: "2026-06-22 08:15",
        timezone: "America/New_York",
        location: "Terminal 4, JFK",
        confirmationCode: "Y8Q4D2",
        assignedTo: ["alex"],
        stage: "airport",
        critical: true,
        confidence: "high",
        notes: "Check-in opens 24h before departure.",
        source: "imported",
      },
    ],
    reviewQueue: [
      {
        id: "review-1",
        reasons: ["Missing minute"],
        impact: "Could shift transfer timing.",
        sourceEmailSubject: "Ride update",
        draft: {
          type: "ride",
          title: "Airport transfer",
          provider: "Lyft",
          localTime: "2026-06-22 11:05",
          timezone: "America/Los_Angeles",
          location: "SFO pickup",
          confirmationCode: "LY-123",
          assignedTo: ["alex"],
          stage: "arrival",
          critical: true,
          confidence: "medium",
          notes: "Confirm pickup zone",
        },
      },
    ],
    readinessItems: [
      {
        id: "ready-flight",
        category: "Flights",
        title: "Verify check-in",
        complete: true,
        required: true,
      },
    ],
  };
}

test("client session state roundtrips with strict parse", () => {
  const snapshot = buildSnapshot();
  const raw = stringifyTravelClientSessionState(snapshot);
  const parsed = parseTravelClientSessionState(raw);
  assert.deepEqual(parsed, snapshot);
});

test("client session parser rejects malformed payloads", () => {
  const bad = JSON.stringify({ version: 1, tripStage: "airport" });
  assert.equal(parseTravelClientSessionState(bad), null);
  assert.equal(parseTravelClientSessionState("not-json"), null);
});
