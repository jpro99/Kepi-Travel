import assert from "node:assert/strict";
import test from "node:test";
import {
  applyVisionExtractToCaptureInput,
  normalizeVisionGateExtract,
} from "@/lib/airportNav/gateVisionExtract";

test("vision extract: null discipline — empty stays null", () => {
  const result = normalizeVisionGateExtract({});
  assert.equal(result.gateString, null);
  assert.equal(result.confidence, null);
});

test("vision extract: parses gate from board text", () => {
  const result = normalizeVisionGateExtract({
    text: "Departures · Gate E12 · Boarding",
    confidence: 0.92,
    source: "vision",
  });
  assert.equal(result.gateString, "E12");
  assert.equal(result.confidence, "high");
});

test("vision extract: low confidence does not invent when token missing", () => {
  const result = normalizeVisionGateExtract({
    text: "Security checkpoint ahead",
    confidence: 0.3,
  });
  assert.equal(result.gateString, null);
});

test("vision extract: never overwrites typed gate on merge", () => {
  const merged = applyVisionExtractToCaptureInput(
    { gateString: "B22" },
    { gateString: "E12", confidence: "high", source: "vision", rawText: null },
  );
  assert.equal(merged.gateString, "B22");
});
