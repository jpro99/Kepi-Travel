import assert from "node:assert/strict";
import test from "node:test";
import {
  resetTravelUpdateCircuitState,
  runTravelUpdateCheck,
  type TravelUpdateProvider,
  type UpdatableReservation,
} from "./updateAdapters";

const SAMPLE_RESERVATIONS: UpdatableReservation[] = [
  {
    id: "flight-1",
    type: "flight",
    title: "DL 407 JFK -> SFO",
    confirmationCode: "Y8Q4D2",
    localTime: "2026-06-22 08:15",
    location: "JFK Terminal 4",
    timezone: "America/New_York",
  },
];

test("mode off returns no provider updates", async () => {
  resetTravelUpdateCircuitState();
  const result = await runTravelUpdateCheck({
    mode: "off",
    reservations: SAMPLE_RESERVATIONS,
    nowIso: "2026-06-21T15:00:00.000Z",
  });
  assert.equal(result.provider, null);
  assert.equal(result.updates.length, 0);
  assert.equal(result.attempts, 0);
  assert.equal(result.error, null);
  assert.equal(result.circuitOpen, false);
});

test("deduplicates repeated provider events", async () => {
  resetTravelUpdateCircuitState();
  const duplicateProvider: TravelUpdateProvider = {
    name: "duplicate-provider",
    async fetchUpdates() {
      return [
        {
          provider: "duplicate-provider",
          kind: "delay",
          severity: "warning",
          summary: "DL 407 delayed 20 minutes",
          detail: "Carrier posted an updated departure estimate.",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2", titleHint: "DL 407 JFK -> SFO" },
          delayMinutes: 20,
        },
        {
          provider: "duplicate-provider",
          kind: "delay",
          severity: "warning",
          summary: "DL 407 delayed 20 minutes",
          detail: "Carrier posted an updated departure estimate.",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2", titleHint: "DL 407 JFK -> SFO" },
          delayMinutes: 20,
        },
      ];
    },
  };

  const result = await runTravelUpdateCheck({
    mode: "mock",
    reservations: SAMPLE_RESERVATIONS,
    nowIso: "2026-06-21T15:00:00.000Z",
    options: { providerOverride: duplicateProvider, disableDelay: true },
  });
  assert.equal(result.attempts, 1);
  assert.equal(result.error, null);
  assert.equal(result.updates.length, 1);
});

test("retries transient provider failures", async () => {
  resetTravelUpdateCircuitState();
  let attempts = 0;
  const flakyProvider: TravelUpdateProvider = {
    name: "flaky-provider",
    async fetchUpdates() {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("Transient upstream timeout");
      }
      return [
        {
          provider: "flaky-provider",
          kind: "delay",
          severity: "warning",
          summary: "DL 407 delayed 12 minutes",
          detail: "Retry path recovered and fetched update.",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
          delayMinutes: 12,
        },
      ];
    },
  };

  const result = await runTravelUpdateCheck({
    mode: "mock",
    reservations: SAMPLE_RESERVATIONS,
    nowIso: "2026-06-21T15:00:00.000Z",
    options: {
      providerOverride: flakyProvider,
      maxAttempts: 3,
      disableDelay: true,
    },
  });

  assert.equal(result.error, null);
  assert.equal(result.attempts, 2);
  assert.equal(result.circuitOpen, false);
  assert.equal(result.updates.length, 1);
});

test("opens circuit after repeated hard failures", async () => {
  resetTravelUpdateCircuitState();
  const failingProvider: TravelUpdateProvider = {
    name: "hard-fail-provider",
    async fetchUpdates() {
      throw new Error("Provider unavailable");
    },
  };

  const first = await runTravelUpdateCheck({
    mode: "mock",
    reservations: SAMPLE_RESERVATIONS,
    nowIso: "2026-06-21T15:00:00.000Z",
    options: {
      providerOverride: failingProvider,
      maxAttempts: 1,
      failureThreshold: 1,
      cooldownMs: 6_000,
      disableDelay: true,
      nowMs: 1_000,
    },
  });

  assert.equal(first.attempts, 1);
  assert.equal(first.circuitOpen, true);
  assert.equal(first.updates.length, 0);
  assert.match(first.error ?? "", /Provider unavailable/);

  const second = await runTravelUpdateCheck({
    mode: "mock",
    reservations: SAMPLE_RESERVATIONS,
    nowIso: "2026-06-21T15:00:00.000Z",
    options: {
      providerOverride: failingProvider,
      maxAttempts: 1,
      failureThreshold: 1,
      cooldownMs: 6_000,
      disableDelay: true,
      nowMs: 2_000,
    },
  });

  assert.equal(second.attempts, 0);
  assert.equal(second.circuitOpen, true);
  assert.equal(second.updates.length, 0);
  assert.match(second.error ?? "", /Circuit open/);
});

test("aggregates checks across multiple providers", async () => {
  resetTravelUpdateCircuitState();
  const providerA: TravelUpdateProvider = {
    name: "provider-a",
    async fetchUpdates() {
      return [
        {
          provider: "provider-a",
          kind: "delay",
          severity: "warning",
          summary: "A delayed 9 minutes",
          detail: "Provider A update",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
          delayMinutes: 9,
        },
      ];
    },
  };
  const providerB: TravelUpdateProvider = {
    name: "provider-b",
    async fetchUpdates() {
      return [
        {
          provider: "provider-b",
          kind: "gate-change",
          severity: "warning",
          summary: "Gate changed to C3",
          detail: "Provider B update",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
          updatedLocation: "Gate C3",
        },
      ];
    },
  };

  const result = await runTravelUpdateCheck({
    mode: "auto",
    reservations: SAMPLE_RESERVATIONS,
    nowIso: "2026-06-21T15:00:00.000Z",
    options: {
      providersOverride: [providerA, providerB],
      disableDelay: true,
    },
  });

  assert.equal(result.provider, "provider-a, provider-b");
  assert.equal(result.updates.length, 2);
  assert.equal(result.providerReports.length, 2);
  assert.equal(result.providerReports[0]?.provider, "provider-a");
  assert.equal(result.providerReports[1]?.provider, "provider-b");
});

test("conflict resolution picks higher-priority provider for same domain", async () => {
  resetTravelUpdateCircuitState();
  const lowerPriorityProvider: TravelUpdateProvider = {
    name: "mock-transport-adapter",
    async fetchUpdates() {
      return [
        {
          provider: "mock-transport-adapter",
          kind: "delay",
          severity: "warning",
          summary: "Mock delay 18 minutes",
          detail: "Mock provider timing signal.",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
          delayMinutes: 18,
        },
      ];
    },
  };
  const higherPriorityProvider: TravelUpdateProvider = {
    name: "flight-status-provider",
    async fetchUpdates() {
      return [
        {
          provider: "flight-status-provider",
          kind: "delay",
          severity: "warning",
          summary: "Flight provider delay 18 minutes",
          detail: "Authoritative provider timing signal.",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
          delayMinutes: 18,
        },
      ];
    },
  };

  const result = await runTravelUpdateCheck({
    mode: "auto",
    reservations: SAMPLE_RESERVATIONS,
    nowIso: "2026-06-21T15:00:00.000Z",
    options: {
      providersOverride: [lowerPriorityProvider, higherPriorityProvider],
      disableDelay: true,
    },
  });

  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0]?.provider, "flight-status-provider");
  assert.equal(result.conflictResolution?.suppressedUpdates, 1);
});

test("conflict resolution keeps updates from different domains", async () => {
  resetTravelUpdateCircuitState();
  const providerTiming: TravelUpdateProvider = {
    name: "provider-timing",
    async fetchUpdates() {
      return [
        {
          provider: "provider-timing",
          kind: "delay",
          severity: "warning",
          summary: "Timing update",
          detail: "Delay event",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
          delayMinutes: 22,
        },
      ];
    },
  };
  const providerLocation: TravelUpdateProvider = {
    name: "provider-location",
    async fetchUpdates() {
      return [
        {
          provider: "provider-location",
          kind: "gate-change",
          severity: "warning",
          summary: "Gate changed to B7",
          detail: "Location event",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
          updatedLocation: "Gate B7",
        },
      ];
    },
  };

  const result = await runTravelUpdateCheck({
    mode: "auto",
    reservations: SAMPLE_RESERVATIONS,
    nowIso: "2026-06-21T15:00:00.000Z",
    options: {
      providersOverride: [providerTiming, providerLocation],
      disableDelay: true,
    },
  });

  assert.equal(result.updates.length, 2);
  assert.equal(result.conflictResolution?.suppressedUpdates, 0);
});

test("cancellation wins status-domain conflict", async () => {
  resetTravelUpdateCircuitState();
  const onTimeProvider: TravelUpdateProvider = {
    name: "provider-on-time",
    async fetchUpdates() {
      return [
        {
          provider: "provider-on-time",
          kind: "on-time",
          severity: "info",
          summary: "Flight remains on time",
          detail: "On-time event",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
        },
      ];
    },
  };
  const cancellationProvider: TravelUpdateProvider = {
    name: "provider-cancellation",
    async fetchUpdates() {
      return [
        {
          provider: "provider-cancellation",
          kind: "cancellation",
          severity: "critical",
          summary: "Flight cancelled",
          detail: "Cancellation event",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
        },
      ];
    },
  };

  const result = await runTravelUpdateCheck({
    mode: "auto",
    reservations: SAMPLE_RESERVATIONS,
    nowIso: "2026-06-21T15:00:00.000Z",
    options: {
      providersOverride: [onTimeProvider, cancellationProvider],
      disableDelay: true,
    },
  });

  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0]?.kind, "cancellation");
  assert.equal(result.conflictResolution?.suppressedUpdates, 1);
});
