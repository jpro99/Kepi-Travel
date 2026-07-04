import assert from "node:assert/strict";
import test from "node:test";
import { processTripMemoryPhotoBytes } from "@/lib/travelAssistant/tripMemoryImageProcess";

// 2x2 PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("processTripMemoryPhotoBytes creates display and print JPEG variants", async () => {
  const processed = await processTripMemoryPhotoBytes(TINY_PNG);
  assert.equal(processed.contentType, "image/jpeg");
  assert.ok(processed.displayBytes.length > 0);
  assert.ok(processed.printBytes.length > 0);
});
