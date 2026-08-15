import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CONSUMER_TAB_BAR } from "@/lib/travelAssistant/consumerTabs";
import { MOBILE_PRIMARY_TABS } from "@/components/travelAssistant/mobile/mobileShellTypes";

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

test("G25 share view is Picasso light — never GitHub dark", () => {
  const shareFiles = [
    "src/components/share/SharedTripView.tsx",
    "src/components/share/SharedTripReservations.tsx",
    "src/components/share/JoinCollaborateButton.tsx",
    "src/components/share/ShareTripPhotosNav.tsx",
    "src/components/share/SharedHotelDetailSheet.tsx",
    "src/app/share/[token]/page.tsx",
  ];
  for (const rel of shareFiles) {
    const src = readSrc(rel);
    assert.doesNotMatch(src, /#0d1117/, `${rel} must not use GitHub dark #0d1117`);
    assert.doesNotMatch(src, /#161b22/, `${rel} must not use GitHub dark #161b22`);
  }
  assert.match(readSrc("src/components/share/SharedTripView.tsx"), /#F5F5F7/);
  assert.match(readSrc("src/app/share/[token]/page.tsx"), /#F5F5F7/);
});

test("G25 tab bar is five items — Photos stays a deep-link tab", () => {
  assert.equal(CONSUMER_TAB_BAR.length, 5);
  assert.equal(
    CONSUMER_TAB_BAR.some(([id]) => id === "photos"),
    false,
  );
  assert.equal(MOBILE_PRIMARY_TABS.length, 5);
  assert.equal(
    MOBILE_PRIMARY_TABS.some((tab) => tab.id === "photos"),
    false,
  );
  const tabBar = readSrc("src/components/travelAssistant/mobile/MobileTabBar.tsx");
  assert.match(tabBar, /grid-cols-5/);
  assert.doesNotMatch(tabBar, /grid-cols-6/);
});

test("G25 review badges never show raw parse scores or ISO time copy", () => {
  const review = readSrc("src/components/travelAssistant/ReviewQueue.tsx");
  assert.doesNotMatch(review, /\(\{score\}\)/);
  assert.doesNotMatch(review, /YYYY-MM-DD HH:MM/);
  assert.match(review, /datetime-local/);
  assert.match(review, /Departure date & time/);

  const page = readSrc("src/app/travel-assistant/page.tsx");
  assert.doesNotMatch(page, /departure time \(YYYY-MM-DD HH:MM\)/);
  assert.match(page, /type="datetime-local"/);
  assert.match(page, /Departure date & time/);
});
