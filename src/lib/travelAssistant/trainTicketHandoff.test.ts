import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrainTicketHandoffContent,
  isBookedTrainReservation,
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

test("resolveTrainTicketOpenTarget prefers ticket link from sourceLinks", () => {
  const target = resolveTrainTicketOpenTarget({
    ...SEP_8_MON_LECCE,
    sourceLinks: [
      { label: "View ticket", url: "https://www.trenitalia.com/ticket/abc", kind: "ticket" },
    ],
  });
  assert.equal(target?.url, "https://www.trenitalia.com/ticket/abc");
  assert.equal(target?.label, "Train tickets");
});

test("resolveTrainTicketOpenTarget falls back to source email when no external URL", () => {
  const target = resolveTrainTicketOpenTarget(
    {
      ...SEP_8_MON_LECCE,
      hasPdfAttachment: true,
      originalEmailText: "Trenitalia ticket Monopoli Lecce",
    },
    "trip-europe-2026",
  );
  assert.match(target?.url ?? "", /\/api\/reservations\/source-view\?/u);
  assert.equal(target?.label, "Train tickets");
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
  assert.match(handoffs[0]?.headline ?? "", /4393|Regionale|Trenitalia/u);
  assert.match(handoffs[0]?.headline ?? "", /Monopoli/u);
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
