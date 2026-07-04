import assert from "node:assert/strict";
import test from "node:test";
import { createTrip } from "@/lib/travelAssistant/tripStore";
import {
  createShareLink,
  getSharedTrip,
  revokeShareLink,
} from "@/lib/travelAssistant/tripShareStore";
import { generateId } from "@/lib/utils/generateId";

test("createShareLink produces token and shared trip payload", async () => {
  const userId = `trip-share-${generateId()}`;
  const trip = await createTrip(
    {
      name: "Summer LA",
      destination: "Los Angeles",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      stage: "readiness",
      reservations: [
        {
          id: "res-1",
          type: "flight",
          title: "DL 407 JFK -> LAX",
          provider: "Delta",
          localTime: "2026-09-01 09:10",
          timezone: "America/Los_Angeles",
          location: "JFK Terminal 4",
          confirmationCode: "Y8Q4D2",
          assignedTo: ["alex"],
          stage: "airport",
          critical: true,
          confidence: "high",
          notes: "Window seat preferred",
          source: "manual",
        },
      ],
    },
    userId,
  );

  const share = await createShareLink(userId, trip.id, {
    expiresInDays: 7,
    readOnly: true,
    showPersonalNotes: false,
  });

  assert.equal(share.token.length, 12);

  const sharedTrip = await getSharedTrip(share.token);
  assert.equal(sharedTrip.status, "ok");
  if (sharedTrip.status === "ok") {
    assert.equal(sharedTrip.trip.name, "Summer LA");
    assert.equal(sharedTrip.trip.reservations[0]?.notes, undefined);
  }
});

test("createShareLink stores intendedEmail on email-locked invites", async () => {
  const userId = `trip-share-email-${generateId()}`;
  const trip = await createTrip(
    {
      name: "Europe 2026",
      destination: "Italy",
      startDate: "2026-06-01",
      endDate: "2026-06-14",
      stage: "readiness",
      reservations: [],
    },
    userId,
  );

  const share = await createShareLink(
    userId,
    trip.id,
    { expiresInDays: 7, readOnly: true, showPersonalNotes: false },
    "family@example.com",
  );

  assert.equal(share.intendedEmail, "family@example.com");
  assert.equal(share.token.length, 12);
});

test("revokeShareLink invalidates public token", async () => {
  const userId = `trip-share-revoke-${generateId()}`;
  const trip = await createTrip(
    {
      name: "Trip Revoke",
      destination: "Chicago",
      startDate: "2026-10-01",
      endDate: "2026-10-03",
      stage: "readiness",
      reservations: [],
    },
    userId,
  );

  const share = await createShareLink(userId, trip.id, {
    expiresInDays: 3,
    readOnly: true,
    showPersonalNotes: true,
  });
  const revoked = await revokeShareLink(share.token, userId);
  assert.equal(revoked, true);
  const sharedTrip = await getSharedTrip(share.token);
  assert.equal(sharedTrip.status, "revoked");
});
