#!/usr/bin/env node
/**
 * Parse a local PDF through text extraction + regex merge (no API key required).
 * Usage: node --import tsx scripts/parse-bali-pdf.mjs [path-to.pdf]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { extractPdfPlainText, preparePdfTextForParsing } from "../src/lib/travelAssistant/pdfTextExtract.ts";
import { mergeConfirmationDrafts } from "../src/lib/travelAssistant/confirmationDraftMerge.ts";

const defaultPath = resolve("BaliVacationFlights.pdf");
const pdfPath = resolve(process.argv[2] ?? defaultPath);

if (!existsSync(pdfPath)) {
  console.error(`PDF not found: ${pdfPath}`);
  console.error("Place BaliVacationFlights.pdf in the repo root or pass a path.");
  process.exit(1);
}

const bytes = readFileSync(pdfPath);
const head = bytes.subarray(0, 5).toString("ascii");
if (head !== "%PDF-") {
  console.error(`Not a valid PDF (header ${JSON.stringify(head)}).`);
  console.error("If you only have BaliVacationFlights.pdf.url, download the real PDF from Google Drive first.");
  process.exit(1);
}

const plainText = preparePdfTextForParsing(await extractPdfPlainText(bytes));
if (plainText.length < 40) {
  console.error("PDF has little or no extractable text — it may be image-only (Claude vision still required).");
  process.exit(1);
}

const drafts = mergeConfirmationDrafts([], plainText);
console.log(JSON.stringify({ textLength: plainText.length, legCount: drafts.length, drafts }, null, 2));

if (drafts.length === 0) {
  process.exit(1);
}
