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

test("buildHotelSearchProviderBody clarifies Duffel is not required for LiteAPI", () => {
  const body = buildHotelSearchProviderBody({ source: "liteapi" });
  assert.match(body, /LiteAPI/i);
  assert.match(body, /Duffel/i);
  assert.match(body, /not required/i);

  const estimated = buildHotelSearchProviderBody({ source: "estimated" });
  assert.match(estimated, /pending/i);
  assert.match(estimated, /LiteAPI/i);
});

test("buildHotelSearchProviderHeadline distinguishes estimated from live", () => {
  assert.match(buildHotelSearchProviderHeadline({ source: "estimated", liveBookableCount: 0 }), /sample/i);
  assert.match(
    buildHotelSearchProviderHeadline({ source: "liteapi", liveBookableCount: 2 }),
    /2 hotels ready to book/i,
  );
});
