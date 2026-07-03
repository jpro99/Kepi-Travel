import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHotelSearchProviderBody,
  buildHotelSearchProviderHeadline,
  resolveHotelInventoryKind,
  resolveHotelInventoryBadge,
} from "@/lib/hotels/hotelInventoryBadge";

test("resolveHotelInventoryKind classifies Kepi-live, catalog, and estimated hotels", () => {
  assert.equal(
    resolveHotelInventoryKind({
      id: "liteapi-abc",
      browseOnly: false,
      bookOfferId: "offer-1",
      pricePerNight: 180,
    }),
    "kepi_live",
  );

  assert.equal(
    resolveHotelInventoryKind({
      id: "liteapi-catalog-abc",
      browseOnly: true,
      bookOfferId: undefined,
      pricePerNight: 0,
    }),
    "browse_google",
  );

  assert.equal(
    resolveHotelInventoryKind({
      id: "est-123",
      browseOnly: true,
      bookOfferId: undefined,
      pricePerNight: 0,
    }),
    "estimated",
  );
});

test("resolveHotelInventoryBadge returns user-facing labels", () => {
  const live = resolveHotelInventoryBadge({
    id: "liteapi-abc",
    browseOnly: false,
    bookOfferId: "offer-1",
    pricePerNight: 180,
  });
  assert.equal(live.label, "Live in Kepi");

  const sample = resolveHotelInventoryBadge({
    id: "est-123",
    browseOnly: true,
    bookOfferId: undefined,
    pricePerNight: 0,
  });
  assert.equal(sample.label, "Estimated sample");
});

test("buildHotelSearchProviderBody clarifies trip-first booking flow", () => {
  const body = buildHotelSearchProviderBody({ source: "liteapi" });
  assert.match(body, /Google/i);
  assert.match(body, /forward your confirmation/i);

  const estimated = buildHotelSearchProviderBody({ source: "estimated" });
  assert.match(estimated, /LiteAPI/i);
  assert.match(estimated, /Duffel/i);
});

test("buildHotelSearchProviderHeadline distinguishes estimated from live", () => {
  assert.match(buildHotelSearchProviderHeadline({ source: "estimated", liveBookableCount: 0 }), /sample/i);
  assert.match(
    buildHotelSearchProviderHeadline({ source: "liteapi", liveBookableCount: 2 }),
    /Google/i,
  );
});
