import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { mergeConfirmationDrafts } from "./confirmationDraftMerge";
import { extractConfirmationPlainText, resolveConfirmationScanKind } from "./confirmationDocumentText";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

test("mergeConfirmationDrafts extracts all Bali vacation legs from plain text fixture", async () => {
  const text = readFileSync(join(fixtureDir, "baliVacationFlights.txt"), "utf8");
  const drafts = mergeConfirmationDrafts([], text);
  assert.ok(drafts.length >= 4, `expected multiple legs, got ${drafts.length}`);
  const flightNumbers = drafts.map((draft) => draft.flightNumber.replace(/\s+/gu, ""));
  assert.ok(flightNumbers.some((value) => value.includes("865")));
  assert.ok(flightNumbers.some((value) => value.includes("875")));
});

test("html mislabeled pdf extracts readable text for regex merge", async () => {
  const html = `<!doctype html><html><body>
    <h1>ALASKA AIRLINES</h1>
    <p>Flight 1 of 2</p>
    <p>AS 865</p>
    <p>Ontario, CA (ONT) to Seattle, WA (SEA)</p>
    <p>Departure: Friday, September 12, 2025 at 6:00 AM</p>
  </body></html>`;
  const bytes = Buffer.from(html, "utf8");
  const file = new File([bytes], "trip.pdf", { type: "application/pdf" });
  const kind = resolveConfirmationScanKind(file, bytes);
  assert.equal(kind, "html");
  const plain = await extractConfirmationPlainText(bytes, kind);
  assert.match(plain, /AS 865/);
  const drafts = mergeConfirmationDrafts([], plain);
  assert.ok(drafts.length >= 1);
});
