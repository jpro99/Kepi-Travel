import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrainTicketHandoffContent,
  isBookedTrainReservation,
  reservationHasStoredTicketArtifact,
  resolveTodayTrainTicketHandoffs,
  resolveTrainTicketOpenTarget,
  resolveTrainTicketsForDay,
  trainReservationsOnDay,
} from "@/lib/travelAssistant/trainTicketHandoff";

const SEP_8_MON_LECCE: import("@/lib/travelAssistant/trainTicketHandoff").TrainTicketSourceReservation = {
  id: "train-mon-lecce",
  type: "train",
  title: "Regionale Veloce 4393",
  provider: "Trenitalia",
  trainNumber: "4393",
  localTime: "2026-09-08 09:42",
  location: "Monopoli → Lecce",
  confirmationCode: "ABC123",
};

test("isBookedTrainReservation accepts confirmed train, rejects planned", () => {
  assert.equal(isBookedTrainReservation(SEP_8_MON_LECCE), true);
  assert.equal(
    isBookedTrainReservation({ ...SEP_8_MON_LECCE, plannedOnly: true }),
    false,
  );
  assert.equal(
    isBookedTrainReservation({ ...SEP_8_MON_LECCE, type: "ride" }),
    false,
  );
});

test("trainReservationsOnDay finds Sep 8 Monopoli → Lecce train", () => {
  const onDay = trainReservationsOnDay(
    [SEP_8_MON_LECCE, { ...SEP_8_MON_LECCE, id: "other", localTime: "2026-09-12 06:20" }],
    "2026-09-08",
  );
  assert.equal(onDay.length, 1);
  assert.equal(onDay[0]?.id, "train-mon-lecce");
});

test("G51: Sep 8 with PDF opens in-app source-view, not Trenitalia ticket URL", () => {
  const target = resolveTrainTicketOpenTarget(
    {
      ...SEP_8_MON_LECCE,
      hasPdfAttachment: true,
      originalEmailText: "Trenitalia Regionale Veloce 4393 Monopoli Lecce",
      sourceLinks: [
        { label: "View ticket", url: "https://www.trenitalia.com/ticket/abc", kind: "ticket" },
      ],
    },
    "trip-europe-2026",
  );
  assert.match(target?.url ?? "", /\/api\/reservations\/source-view\?/u);
  assert.equal(target?.isExternal, false);
  assert.equal(target?.label, "Train tickets");
});

test("G51: external Trenitalia ticket link only when no stored PDF/email artifact", () => {
  const target = resolveTrainTicketOpenTarget({
    ...SEP_8_MON_LECCE,
    sourceLinks: [
      { label: "View ticket", url: "https://www.trenitalia.com/ticket/abc", kind: "ticket" },
    ],
  });
  assert.equal(target?.url, "https://www.trenitalia.com/ticket/abc");
  assert.equal(target?.isExternal, true);
});

test("G51: manage URL used only when no stored artifact exists", () => {
  const target = resolveTrainTicketOpenTarget({
    ...SEP_8_MON_LECCE,
    manageUrl: "https://www.trenitalia.com/en.html",
  });
  assert.equal(target?.url, "https://www.trenitalia.com/en.html");
  assert.equal(target?.isExternal, true);
});

test("G51: stored PDF beats manage URL on Sep 8 Monopoli → Lecce", () => {
  const target = resolveTrainTicketOpenTarget(
    {
      ...SEP_8_MON_LECCE,
      hasPdfAttachment: true,
      originalEmailText: "Trenitalia ticket Monopoli Lecce",
      manageUrl: "https://www.trenitalia.com/en.html",
    },
    "trip-europe-2026",
  );
  assert.match(target?.url ?? "", /\/api\/reservations\/source-view\?/u);
  assert.equal(target?.isExternal, false);
});

test("G51: in-app boardingPassUrl wins before external manage", () => {
  const target = resolveTrainTicketOpenTarget({
    ...SEP_8_MON_LECCE,
    boardingPassUrl: "/api/reservations/ticket-pdf?reservationId=train-mon-lecce",
    manageUrl: "https://www.trenitalia.com/en.html",
  });
  assert.equal(target?.url, "/api/reservations/ticket-pdf?reservationId=train-mon-lecce");
  assert.equal(target?.isExternal, false);
});

test("reservationHasStoredTicketArtifact true when PDF on reservation", () => {
  assert.equal(
    reservationHasStoredTicketArtifact(
      {
        ...SEP_8_MON_LECCE,
        hasPdfAttachment: true,
        originalEmailText: "ticket",
      },
      "trip-europe-2026",
    ),
    true,
  );
  assert.equal(
    reservationHasStoredTicketArtifact({
      ...SEP_8_MON_LECCE,
      manageUrl: "https://www.trenitalia.com/en.html",
    }),
    false,
  );
});

test("day with train surfaces Train tickets handoff for Sep 8", () => {
  const handoffs = resolveTrainTicketsForDay(
    [
      {
        ...SEP_8_MON_LECCE,
        hasPdfAttachment: true,
        originalEmailText: "Trenitalia Regionale Veloce 4393 Monopoli Lecce",
      },
    ],
    "2026-09-08",
    "trip-europe-2026",
  );
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0]?.primaryActionLabel, "Train tickets");
  assert.match(handoffs[0]?.primaryActionUrl ?? "", /\/api\/reservations\/source-view\?/u);
  assert.match(handoffs[0]?.headline ?? "", /4393|Regionale|Trenitalia/u);
  assert.match(handoffs[0]?.headline ?? "", /Monopoli/u);
  assert.match(handoffs[0]?.honestyNote ?? "", /stored ticket PDF|Kepi/i);
});

test("resolveTodayTrainTicketHandoffs is empty when no train that calendar day", () => {
  const handoffs = resolveTodayTrainTicketHandoffs(
    [SEP_8_MON_LECCE],
    Date.parse("2026-09-07T12:00:00Z"),
    "trip-europe-2026",
  );
  assert.equal(handoffs.length, 0);
});

test("buildTrainTicketHandoffContent returns null without any open path", () => {
  const content = buildTrainTicketHandoffContent({
    ...SEP_8_MON_LECCE,
    confirmationCode: "ONLYCODE",
  });
  assert.equal(content, null);
});
