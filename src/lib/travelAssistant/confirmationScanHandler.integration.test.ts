import assert from "node:assert/strict";
import test from "node:test";
import { handleConfirmationScanUpload } from "./confirmationScanHandler";

test("handleConfirmationScanUpload rejects Google Drive login saved as pdf", async () => {
  const html = `<!doctype html><html><body>Google Drive: Sign-in Sign in to continue to Google Drive Email or phone Forgot email? Create account</body></html>`;
  const file = new File([html], "trip.pdf", { type: "application/pdf" });
  const formData = new FormData();
  formData.append("file", file);

  const request = new Request("http://localhost/api/travel-updates/ticket-scan", {
    method: "POST",
    body: formData,
  });

  const response = await handleConfirmationScanUpload(request, { anthropicApiKey: "" });
  assert.equal(response.status, 502);
  const payload = (await response.json()) as { error?: string };
  assert.match(payload.error ?? "", /google drive/i);
});

test("handleConfirmationScanUpload imports Bali html fixture without AI", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "baliVacationFlightsAsHtml.pdf");
  const bytes = readFileSync(fixturePath);
  const file = new File([bytes], "bali.pdf", { type: "application/pdf" });
  const formData = new FormData();
  formData.append("file", file);

  const request = new Request("http://localhost/api/travel-updates/ticket-scan", {
    method: "POST",
    body: formData,
  });

  const response = await handleConfirmationScanUpload(request, { anthropicApiKey: "" });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { drafts?: Array<{ flightNumber: string }>; count?: number };
  assert.ok((payload.count ?? payload.drafts?.length ?? 0) >= 4);
});
