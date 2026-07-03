import test from "node:test";
import assert from "node:assert/strict";
import { pickDisplayRate } from "@/lib/providers/liteapi/searchHotels";

test("D8 — LiteAPI display rate prefers standard room over advance purchase", () => {
  const picked = pickDisplayRate({
    hotelId: "lp123",
    roomTypes: [
      {
        rates: [
          {
            offerId: "cheap",
            name: "Advance Purchase Room Only",
            retailRate: { total: [{ amount: 179, currency: "USD" }] },
          },
          {
            offerId: "standard",
            name: "Standard King Room",
            retailRate: { total: [{ amount: 597, currency: "USD" }] },
          },
        ],
      },
    ],
  });

  assert.ok(picked);
  assert.equal(picked?.offerId, "standard");
  assert.equal(picked?.total, 597);
  assert.match(picked?.roomName ?? "", /Standard King/i);
});
