import test from "node:test";
import assert from "node:assert/strict";
import { resolveHotelStayDistricts } from "@/lib/hotels/hotelStayDistricts";

test("resolveHotelStayDistricts returns Lecce districts", () => {
  const districts = resolveHotelStayDistricts("Lecce, Italy");
  assert.ok(districts.length >= 2);
  assert.ok(districts.some((district) => district.name.toLowerCase().includes("historic")));
});
