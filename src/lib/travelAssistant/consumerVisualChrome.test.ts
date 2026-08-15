import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CONSUMER_CHROME_EMOJI,
  CONSUMER_SECTION_KEYS,
  EMPTY_HOME_CARD_CLASS,
  emptyHomeUsesNavyCockpit,
} from "@/lib/travelAssistant/consumerVisualChrome";

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

test("empty Home never uses a navy cockpit", () => {
  assert.equal(emptyHomeUsesNavyCockpit(), false);
  assert.match(EMPTY_HOME_CARD_CLASS, /#F5F5F7/);
  assert.doesNotMatch(EMPTY_HOME_CARD_CLASS, /from-slate-900 via-blue-950/);
});

test("G21 section keys cover More / empty Home / Plan chrome", () => {
  assert.deepEqual([...CONSUMER_SECTION_KEYS], [
    "points",
    "trips",
    "fit",
    "cards",
    "loyalty",
    "packing",
    "family",
    "photos",
    "bug",
    "trash",
    "refresh",
  ]);
});

test("G21 consumer More, empty Home, and Plan use Lucide — no emoji chrome", () => {
  const page = readSrc("src/app/travel-assistant/page.tsx");
  const moreMobile = readSrc("src/components/travelAssistant/mobile/MobileMapForwardShell.tsx");
  const settings = readSrc("src/components/travelAssistant/mobile/MobileSettingsView.tsx");
  const family = readSrc("src/components/travelAssistant/FamilyPanel.tsx");
  const flights = readSrc("src/components/travelAssistant/FlightsTab.tsx");
  const itinerary = readSrc("src/components/travelAssistant/ItineraryTab.tsx");
  const icon = readSrc("src/components/travelAssistant/ConsumerSectionIcon.tsx");

  assert.match(page, /EMPTY_HOME_CARD_CLASS/);
  assert.match(page, /ConsumerSectionIcon/);
  assert.doesNotMatch(page, /from-slate-900 via-blue-950 to-slate-900/);
  assert.doesNotMatch(page, CONSUMER_CHROME_EMOJI);

  assert.match(moreMobile, /ConsumerSectionIcon/);
  assert.doesNotMatch(moreMobile, CONSUMER_CHROME_EMOJI);

  assert.match(settings, /ConsumerSectionIcon/);
  assert.doesNotMatch(settings, CONSUMER_CHROME_EMOJI);

  assert.match(family, /ConsumerSectionIcon/);
  assert.doesNotMatch(family, CONSUMER_CHROME_EMOJI);

  assert.match(flights, /Trash2/);
  assert.doesNotMatch(flights, /🗑/);
  assert.doesNotMatch(flights, /✈/);

  assert.match(itinerary, /CalendarDays/);
  assert.doesNotMatch(itinerary, /✈️/);

  assert.match(icon, /BookOpen/);
  assert.match(icon, /FolderOpen/);
  assert.match(icon, /Compass/);
  assert.match(icon, /CreditCard/);
  assert.match(icon, /Award/);
  assert.match(icon, /Briefcase/);
  assert.match(icon, /Users/);
  assert.match(icon, /Bug/);
  assert.match(icon, /Trash2/);
  assert.match(icon, /RefreshCw/);
  assert.match(icon, /Camera/);
});
