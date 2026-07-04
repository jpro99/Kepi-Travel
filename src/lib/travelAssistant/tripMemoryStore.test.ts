import assert from "node:assert/strict";
import test from "node:test";
import {
  addTripMemoryComment,
  addTripMemoryPhoto,
  getTripMemoryAlbum,
} from "./tripMemoryStore";

test("trip memory album stores photos and comments", async () => {
  const ownerUserId = "memory-test-user";
  const tripId = "trip-memory-1";

  const photo = await addTripMemoryPhoto(ownerUserId, {
    tripId,
    imageUrl: "https://example.com/photo.jpg",
    caption: "Sunset in Rome",
    uploadedByUserId: ownerUserId,
    uploadedByName: "Alex",
  });
  assert.equal(photo.tripId, tripId);

  const comment = await addTripMemoryComment(ownerUserId, {
    tripId,
    photoId: photo.id,
    authorName: "Jordan",
    body: "Beautiful shot!",
  });
  assert.ok(comment);

  const album = await getTripMemoryAlbum(ownerUserId, tripId);
  assert.equal(album.photos.length, 1);
  assert.equal(album.comments.length, 1);
});
