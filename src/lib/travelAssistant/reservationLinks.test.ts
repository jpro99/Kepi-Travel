import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReservationQuickLinks,
  extractReservationSourceLinks,
  resolveBoardingPassUrl,
} from "./reservationLinks";

test("extractReservationSourceLinks finds manage and boarding links in html", () => {
  const html = `
    <p>Thanks for booking.</p>
    <a href="https://www.alaskaair.com/booking/ABC123">Manage your trip</a>
    <a href="https://www.alaskaair.com/boarding/ABC123">View mobile boarding pass</a>
  `;
  const links = extractReservationSourceLinks({ html, type: "flight" });
  assert.ok(links.some((link) => link.kind === "manage"));
  assert.ok(links.some((link) => link.kind === "ticket"));
});

test("buildReservationQuickLinks adds airline manage fallback for flights", () => {
  const links = buildReservationQuickLinks({
    type: "flight",
    provider: "Alaska Airlines",
    confirmationCode: "ABCDEF",
    flightNumber: "AS123",
    flightDate: "2026-09-01",
  });
  assert.ok(links.some((link) => link.url.includes("alaskaair.com")));
});

test("buildReservationQuickLinks adds directions for dinner", () => {
  const links = buildReservationQuickLinks({
    type: "dinner",
    provider: "Carbone",
    location: "Carbone New York NY",
  });
  assert.ok(links.some((link) => link.kind === "directions" && link.url.includes("google.com/maps")));
});

test("resolveBoardingPassUrl prefers ticket links from sourceLinks", () => {
  const url = resolveBoardingPassUrl({
    sourceLinks: [{ label: "Boarding pass", url: "https://example.com/boarding.pkpass", kind: "ticket" }],
  });
  assert.equal(url, "https://example.com/boarding.pkpass");
});

test("resolveBoardingPassUrl extracts ticket link from forwarded html", () => {
  const html = `<a href="https://www.alaskaair.com/boarding/ABC123">View mobile boarding pass</a>`;
  const url = resolveBoardingPassUrl({
    sourceLinks: extractReservationSourceLinks({ html, type: "flight" }),
    html,
  });
  assert.match(url ?? "", /boarding\/ABC123/);
});
