import assert from "node:assert/strict";
import test from "node:test";
import { hotelBookLeadMode, showHotelSearchLauncherAtTop } from "@/lib/travelAssistant/hotelBookLead";

test("hotelBookLeadMode prefers booked stays over search", () => {
  assert.equal(hotelBookLeadMode({ upcomingStayCount: 2, nightsNeedingHotel: 3 }), "stays");
  assert.equal(hotelBookLeadMode({ upcomingStayCount: 1, nightsNeedingHotel: 0 }), "stays");
});

test("hotelBookLeadMode is gaps when nights are uncovered and no stays", () => {
  assert.equal(hotelBookLeadMode({ upcomingStayCount: 0, nightsNeedingHotel: 2 }), "gaps");
});

test("hotelBookLeadMode is empty when nothing is booked or missing", () => {
  assert.equal(hotelBookLeadMode({ upcomingStayCount: 0, nightsNeedingHotel: 0 }), "empty");
});

test("showHotelSearchLauncherAtTop only for gaps, never while search is open", () => {
  assert.equal(showHotelSearchLauncherAtTop("gaps", false), true);
  assert.equal(showHotelSearchLauncherAtTop("gaps", true), false);
  assert.equal(showHotelSearchLauncherAtTop("stays", false), false);
  assert.equal(showHotelSearchLauncherAtTop("empty", false), false);
});
