import assert from "node:assert/strict";
import test from "node:test";
import { buildSharedHotelContact, extractPhoneFromText } from "./sharedHotelInfo";

test("extractPhoneFromText finds labeled hotel phone numbers", () => {
  assert.equal(
    extractPhoneFromText("Front desk: +39 080 123 4567"),
    "+39 080 123 4567",
  );
});

test("buildSharedHotelContact prefers stored phone and address", () => {
  const contact = buildSharedHotelContact({
    type: "hotel",
    title: "Hyatt Centric Monopoli",
    provider: "Hyatt",
    localTime: "2026-09-09 15:00",
    location: "Via Venezia 30, Monopoli, Italy",
    confirmationCode: "HY123",
    checkOutDate: "2026-09-12",
    roomType: "King room",
    hotelPhone: "+39 080 555 0100",
  });
  assert.equal(contact.phone, "+39 080 555 0100");
  assert.equal(contact.address, "Via Venezia 30, Monopoli, Italy");
  assert.ok(contact.phoneTelHref?.startsWith("tel:"));
  assert.ok(contact.mapsUrl.includes("google.com/maps"));
});

test("buildSharedHotelContact parses phone from notes when missing", () => {
  const contact = buildSharedHotelContact({
    type: "hotel",
    title: "Grand Hotel",
    provider: "Booking.com",
    localTime: "2026-06-01 15:00",
    location: "Bali",
    confirmationCode: "ABC",
    notes: "Phone: +62 361 555 1212 · 2 guests",
  });
  assert.equal(contact.phone, "+62 361 555 1212");
});
