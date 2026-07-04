import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

test("handleConfirmationScanUpload imports hotel confirmation without AI", async () => {
  const html = `<!doctype html><html><body>
    <p>Hyatt Centric Monopoli</p>
    <p>Confirmation Number: HY123456</p>
    <p>Check-in: Friday, September 4, 2026 at 3:00 PM</p>
    <p>Check-out: Sunday, September 6, 2026</p>
    <p>Location: Monopoli, Italy</p>
  </body></html>`;
  const file = new File([html], "hotel.pdf", { type: "application/pdf" });
  const formData = new FormData();
  formData.append("file", file);

  const request = new Request("http://localhost/api/travel-updates/ticket-scan", {
    method: "POST",
    body: formData,
  });

  const response = await handleConfirmationScanUpload(request, { anthropicApiKey: "" });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { drafts?: Array<{ type: string; title: string }> };
  assert.ok((payload.drafts?.length ?? 0) >= 1);
  assert.equal(payload.drafts?.[0]?.type, "hotel");
  assert.match(payload.drafts?.[0]?.title ?? "", /Hyatt/i);
});

test("handleConfirmationScanUpload imports Bali html fixture without AI", async () => {
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
