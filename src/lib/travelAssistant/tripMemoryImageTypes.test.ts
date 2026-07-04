import assert from "node:assert/strict";
import test from "node:test";
import {
  inferTripPhotoMime,
  isHeicLikeFile,
  isLikelyTripPhotoFile,
} from "@/lib/travelAssistant/tripMemoryImageTypes";

test("isHeicLikeFile detects Samsung/iPhone HEIC uploads", () => {
  assert.equal(isHeicLikeFile("IMG_1234.HEIC", ""), true);
  assert.equal(isHeicLikeFile("photo.heif", "image/heif"), true);
  assert.equal(isHeicLikeFile("photo.jpg", "image/jpeg"), false);
});

test("isLikelyTripPhotoFile accepts common phone gallery types", () => {
  assert.equal(isLikelyTripPhotoFile("photo.heic", "application/octet-stream"), true);
  assert.equal(isLikelyTripPhotoFile("photo.jpg", "image/jpeg"), true);
  assert.equal(isLikelyTripPhotoFile("notes.pdf", "application/pdf"), false);
});

test("inferTripPhotoMime reads HEIC ftyp brand", () => {
  const bytes = new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
  ]);
  assert.equal(inferTripPhotoMime("upload.bin", "", bytes), "image/heic");
});
