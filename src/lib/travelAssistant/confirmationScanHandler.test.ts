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

test("handleConfirmationScanUpload rejects non-pdf/image uploads", async () => {
  const file = new File(["hello"], "notes.txt", { type: "text/plain" });
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
