import assert from "node:assert/strict";
import test from "node:test";
import { pickHomeNextAction } from "./homeNextAction";

test("pickHomeNextAction prefers airport mode when open", () => {
  const next = pickHomeNextAction({
    openAirportMode: true,
    attentionTop3: [
      {
        id: "gap-1",
        status: "needs_you",
        title: "Missing hotel",
        actionLabel: "Add hotel",
      },
    ],
  });
  assert.equal(next.kind, "airport");
  assert.match(next.ctaLabel, /Airport Mode/u);
});

test("pickHomeNextAction prefers top attention gap", () => {
  const next = pickHomeNextAction({
    attentionTop3: [
      {
        id: "stay-gap-1",
        status: "needs_you",
        title: "2 nights open in Monopoli",
        detail: "Find a stay",
        actionLabel: "Add hotel",
        actionTab: "reservations",
      },
    ],
  });
  assert.equal(next.kind, "attention");
  assert.equal(next.title, "2 nights open in Monopoli");
  assert.equal(next.ctaLabel, "Add hotel");
});

test("pickHomeNextAction uses review inbox when no gaps", () => {
  const next = pickHomeNextAction({
    attentionTop3: [],
    unresolvedReviewCount: 2,
  });
  assert.equal(next.kind, "review");
  assert.match(next.title, /2 bookings/u);
});

test("pickHomeNextAction falls back to ready state", () => {
  const next = pickHomeNextAction({
    attentionTop3: [],
    unresolvedReviewCount: 0,
  });
  assert.equal(next.kind, "ready");
  assert.match(next.title, /Nothing urgent/u);
});
