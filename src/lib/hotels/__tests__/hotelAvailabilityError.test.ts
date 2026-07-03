import test from "node:test";
import assert from "node:assert/strict";
import { isHotelSoldOutError, normalizeHotelAvailabilityError } from "@/lib/hotels/hotelAvailabilityError";

test("normalizeHotelAvailabilityError explains sold out", () => {
  const message = normalizeHotelAvailabilityError("Rate sold out for selected dates");
  assert.match(message, /sold out|no longer available/i);
  assert.equal(isHotelSoldOutError("Rate sold out for selected dates"), true);
});

test("normalizeHotelAvailabilityError handles empty errors", () => {
  assert.match(normalizeHotelAvailabilityError(undefined), /no longer available/i);
});

test("normalizeHotelAvailabilityError handles nested LiteAPI errors", () => {
  const message = normalizeHotelAvailabilityError({
    error: { message: "Rate sold out for selected dates" },
  });
  assert.match(message, /sold out|no longer available/i);
});
