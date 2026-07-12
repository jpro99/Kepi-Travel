import assert from "node:assert/strict";
import test from "node:test";
import { resetAdminUserIdsCacheForTests } from "@/lib/admin/adminAccess";
import {
  joinTripAsCollaborator,
  leaveTripCollaboration,
  listCollaborativeTripsForUser,
  resolveTripWriteAccess,
} from "@/lib/travelAssistant/tripCollaboratorStore";
import { createShareLink } from "@/lib/travelAssistant/tripShareStore";
import { createTrip, updateTrip } from "@/lib/travelAssistant/tripStore";
import { generateId } from "@/lib/utils/generateId";

test("joinTripAsCollaborator grants editor access when both users have Pro", async () => {
  const ownerId = `owner-${generateId()}`;
  const partnerId = `partner-${generateId()}`;
  process.env.ADMIN_USER_IDS = `${ownerId},${partnerId}`;
  resetAdminUserIdsCacheForTests();

  const trip = await createTrip(
    {
      name: "Puglia with partner",
      destination: "Polignano",
      startDate: "2026-09-01",
      endDate: "2026-09-08",
      stage: "readiness",
      reservations: [],
    },
    ownerId,
  );

  const share = await createShareLink(ownerId, trip.id, {
    expiresInDays: 14,
    readOnly: false,
    showPersonalNotes: true,
  });

  const joined = await joinTripAsCollaborator({
    token: share.token,
    collaboratorUserId: partnerId,
  });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;

  const collabTrips = await listCollaborativeTripsForUser(partnerId);
  assert.equal(collabTrips.length, 1);
  assert.equal(collabTrips[0]?.id, trip.id);
  assert.equal(collabTrips[0]?.collaboration?.ownerUserId, ownerId);

  const access = await resolveTripWriteAccess(partnerId, trip.id);
  assert.ok(access);
  assert.equal(access?.canEdit, true);
  assert.equal(access?.ownerUserId, ownerId);

  const updated = await updateTrip(trip.id, { name: "Puglia together" }, ownerId);
  assert.equal(updated?.name, "Puglia together");

  const left = await leaveTripCollaboration({ collaboratorUserId: partnerId, tripId: trip.id });
  assert.equal(left, true);
  assert.equal((await listCollaborativeTripsForUser(partnerId)).length, 0);
});

test("joinTripAsCollaborator rejects view-only invites", async () => {
  const ownerId = `owner-ro-${generateId()}`;
  const partnerId = `partner-ro-${generateId()}`;
  process.env.ADMIN_USER_IDS = `${ownerId},${partnerId}`;
  resetAdminUserIdsCacheForTests();

  const trip = await createTrip(
    {
      name: "View only Italy",
      destination: "Rome",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      stage: "readiness",
      reservations: [],
    },
    ownerId,
  );

  const share = await createShareLink(ownerId, trip.id, {
    expiresInDays: 7,
    readOnly: true,
    showPersonalNotes: false,
  });

  const joined = await joinTripAsCollaborator({
    token: share.token,
    collaboratorUserId: partnerId,
  });
  assert.equal(joined.ok, false);
  if (joined.ok) return;
  assert.equal(joined.code, "read-only");
});

test("joinTripAsCollaborator requires Pro for both people", async () => {
  const ownerId = `owner-free-${generateId()}`;
  const partnerId = `partner-free-${generateId()}`;
  // Only owner is Pro/admin — partner is free
  process.env.ADMIN_USER_IDS = ownerId;
  resetAdminUserIdsCacheForTests();

  const trip = await createTrip(
    {
      name: "Needs both Pro",
      destination: "Milan",
      startDate: "2026-11-01",
      endDate: "2026-11-04",
      stage: "readiness",
      reservations: [],
    },
    ownerId,
  );

  const share = await createShareLink(ownerId, trip.id, {
    expiresInDays: 7,
    readOnly: false,
    showPersonalNotes: true,
  });

  const joined = await joinTripAsCollaborator({
    token: share.token,
    collaboratorUserId: partnerId,
  });
  assert.equal(joined.ok, false);
  if (joined.ok) return;
  assert.equal(joined.code, "upgrade-required");
});
