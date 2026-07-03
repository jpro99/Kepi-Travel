import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveHotelDestinationSync,
  suggestHotelCityDestinations,
  suggestHotelDestinations,
} from "@/lib/hotels/resolveDestination";

test("suggestHotelCityDestinations suggests Lecce when typing lecce", () => {
  const hits = suggestHotelCityDestinations("lecce");
  assert.ok(hits.some((hit) => hit.label === "Lecce, Italy"));
});

test("suggestHotelCityDestinations suggests Lecce when typing lecce, italy", () => {
  const hits = suggestHotelCityDestinations("Lecce, Italy");
  assert.ok(hits.some((hit) => hit.label === "Lecce, Italy"));
});

test("suggestHotelDestinations includes Lecce in combined suggestions", () => {
  const hits = suggestHotelDestinations("lecce");
  assert.ok(hits.includes("Lecce, Italy"));
});

test("resolveHotelDestinationSync resolves Lecce, Italy", () => {
  const resolved = resolveHotelDestinationSync("Lecce, Italy");
  assert.equal(resolved?.displayName, "Lecce, Italy");
  assert.ok(Math.abs((resolved?.lat ?? 0) - 40.3515) < 0.01);
});
