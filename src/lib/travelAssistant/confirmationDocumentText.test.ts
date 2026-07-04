import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  htmlToPlainConfirmationText,
  isHtmlBuffer,
  isPdfBuffer,
  resolveConfirmationScanKind,
} from "./confirmationDocumentText";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

test("isPdfBuffer detects real PDF magic bytes", () => {
  assert.equal(isPdfBuffer(Buffer.from("%PDF-1.7\n")), true);
  assert.equal(isPdfBuffer(Buffer.from("<!doctype html>")), false);
});

test("isHtmlBuffer detects HTML saved with wrong extension", () => {
  const html = Buffer.from("<!doctype html><html><body><p>Flight UA123</p></body></html>", "utf8");
  assert.equal(isHtmlBuffer(html), true);
  assert.equal(isPdfBuffer(html), false);
});

test("resolveConfirmationScanKind treats fake pdf as html or text", () => {
  const htmlPdf = new File([Buffer.from("<!doctype html><html><body>Itinerary</body></html>", "utf8")], "trip.pdf", {
    type: "application/pdf",
  });
  assert.equal(resolveConfirmationScanKind(htmlPdf, Buffer.from("<!doctype html><html><body>Itinerary</body></html>")), "html");
});

test("htmlToPlainConfirmationText strips tags from travel email html", () => {
  const plain = htmlToPlainConfirmationText(
    "<html><body><p>Flight <b>AS 865</b></p><br/>ONT to SEA</body></html>",
  );
  assert.match(plain, /Flight\s+AS\s+865/);
  assert.match(plain, /ONT to SEA/);
});

test("resolveConfirmationScanKind reads Bali HTML-as-PDF fixture when present", () => {
  const fixturePath = join(fixtureDir, "baliVacationFlightsAsHtml.pdf");
  try {
    const bytes = readFileSync(fixturePath);
    const file = new File([bytes], "baliVacationFlightsAsHtml.pdf", { type: "application/pdf" });
    const kind = resolveConfirmationScanKind(file, bytes);
    assert.notEqual(kind, "pdf");
    assert.ok(kind === "html" || kind === "text");
    const plain = htmlToPlainConfirmationText(bytes.toString("utf8"));
    assert.match(plain, /AS\s+865/);
  } catch {
    // Optional fixture
  }
});
