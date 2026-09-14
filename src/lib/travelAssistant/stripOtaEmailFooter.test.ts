import assert from "node:assert/strict";
import test from "node:test";
import {
  isOtaBookingConfirmation,
  isOtaEmailFooterLine,
  stripOtaEmailFooterLines,
} from "@/lib/travelAssistant/stripOtaEmailFooter";
import { notesToBullets } from "@/lib/travelAssistant/narrativeItineraryExport";
import { looksLikeDayPlanItinerary } from "@/lib/travelAssistant/parseDayPlanItinerary";

const airbnbVeniceEmail = `
Reservation confirmed
Cosy, Romantic & Stylish Studio
Entire home/apt hosted by Alessia
Check-in
Sat, Sep 12
After 3:00 PM
Checkout
Tue, Sep 15
By 10:00 AM
Address
Rio dei Miracoli, 30121 Venice, Veneto, Italy
Guests
2 adults
House rules
2 guests maximum
Get the app.
The fastest, easiest way to Airbnb.
[image: App Store]
https://www.airbnb.com/interstitial?c=.pi80.pkTUVTU0FHSU5HX05FV19NRVNTQU
[image: Google Play]
Airbnb, Inc.,
888 Brannan St., San Francisco, CA 94103, USA
Update your email preferences
https://www.airbnb.com/account-settings/notifications
`;

test("G66: Airbnb confirmation is not a day-plan itinerary", () => {
  assert.equal(
    looksLikeDayPlanItinerary(airbnbVeniceEmail, "Reservation confirmed - Venice studio"),
    false,
  );
  assert.equal(isOtaBookingConfirmation(airbnbVeniceEmail, "Reservation confirmed"), true);
});

test("G66: Plan bullets strip Airbnb footer junk", () => {
  const junkNote = [
    "• 10:00 AM",
    "• Guests",
    "• 2 adults",
    "• [image: Airbnb]",
    "• Get the app.",
    "• Airbnb, Inc., 888 Brannan St., San Francisco, CA 94103, USA",
    "• Update your email preferences",
    "• https://www.airbnb.com/interstitial?c=abc",
  ].join("\n");
  const bullets = notesToBullets(junkNote);
  assert.deepEqual(bullets, []);
  assert.equal(isOtaEmailFooterLine("888 Brannan St., San Francisco"), true);
  assert.equal(stripOtaEmailFooterLines(["Explore Dorsoduro", "Get the app."]).join("|"), "Explore Dorsoduro");
});
