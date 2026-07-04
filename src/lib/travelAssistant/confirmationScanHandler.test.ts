import assert from "node:assert/strict";
import test from "node:test";
import { handleConfirmationScanUpload } from "./confirmationScanHandler";

test("handleConfirmationScanUpload rejects oversize uploads", async () => {
  const bigBody = new Uint8Array(4 * 1024 * 1024 + 1);
  const file = new File([bigBody], "big.pdf", { type: "application/pdf" });
  const formData = new FormData();
  formData.append("file", file);

  const request = new Request("http://localhost/api/travel-updates/ticket-scan", {
    method: "POST",
    body: formData,
  });

  const response = await handleConfirmationScanUpload(request, {
    anthropicApiKey: "test-key",
  });
  assert.equal(response.status, 413);
  const payload = (await response.json()) as { error?: string };
  assert.match(payload.error ?? "", /too large/i);
});

test("handleConfirmationScanUpload accepts text confirmations", async () => {
  const file = new File(["Flight UA123 SFO to LAX"], "notes.txt", { type: "text/plain" });
  const formData = new FormData();
  formData.append("file", file);

  const request = new Request("http://localhost/api/travel-updates/ticket-scan", {
    method: "POST",
    body: formData,
  });

  const response = await handleConfirmationScanUpload(request, {
    anthropicApiKey: "test-key",
  });
  assert.notEqual(response.status, 422);
});

test("handleConfirmationScanUpload rejects unsupported binary uploads", async () => {
  const file = new File(["hello"], "program.exe", { type: "application/octet-stream" });
  const formData = new FormData();
  formData.append("file", file);

  const request = new Request("http://localhost/api/travel-updates/ticket-scan", {
    method: "POST",
    body: formData,
  });

  const response = await handleConfirmationScanUpload(request, {
    anthropicApiKey: "test-key",
  });
  assert.equal(response.status, 422);
});
