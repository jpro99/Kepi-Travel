import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGalleryFromUrls,
  extractLiteApiHotelId,
  mergeHotelDetailMedia,
  parseLiteApiHotelDetailMedia,
} from "@/lib/hotels/hotelMedia";

test("extractLiteApiHotelId parses catalog and live ids", () => {
  assert.equal(extractLiteApiHotelId("liteapi-lp123"), "lp123");
  assert.equal(extractLiteApiHotelId("liteapi-catalog-lp456"), "lp456");
  assert.equal(extractLiteApiHotelId("duffel-abc"), null);
});

test("parseLiteApiHotelDetailMedia maps hotel and room photos", () => {
  const media = parseLiteApiHotelDetailMedia({
    main_photo: "https://example.com/main.jpg",
    hotelImages: [{ url: "https://example.com/pool.jpg", caption: "swimming pool" }],
    rooms: [
      {
        id: 1,
        roomName: "Deluxe King",
        description: "King bed with city view.",
        photos: [{ url: "https://example.com/room.jpg", hd_url: "https://example.com/room-hd.jpg" }],
      },
    ],
    hotelDescription: "<p>Great hotel in the center.</p>",
  });

  assert.ok(media.images.some((image) => image.url.includes("room-hd")));
  assert.equal(media.rooms.length, 1);
  assert.equal(media.rooms[0]?.name, "Deluxe King");
  assert.match(media.description ?? "", /Great hotel/);
});

test("mergeHotelDetailMedia keeps fetched photos and adds search fallbacks", () => {
  const merged = mergeHotelDetailMedia(
    {
      images: buildGalleryFromUrls(["https://example.com/a.jpg"]),
      rooms: [],
    },
    ["https://example.com/b.jpg"],
  );
  assert.equal(merged.images.length, 2);
});
