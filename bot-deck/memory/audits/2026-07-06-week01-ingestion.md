# Kepi Weekly Audit — Week 1: Ingestion & parsing
Date: 2026-07-06

## This week's focus + why

Email forwarding, PDF attachments, and trip assembly — Jeff's Europe 2026 trip still shows "Add cost" on ITA legs despite prices visible in PDFs. Recent fixes shipped (`f78673e`: per-leg pricing, PDF text preservation, re-forward merge). This audit asks what still blocks **self-service recovery** without another Cursor session.

## What's weak or generic

1. **User doesn't know if PDF was read** — forwarding succeeds but there's no per-reservation signal ("PDF parsed" vs "email body only" vs "pricing not found in text").
2. **Re-scan copy is stale** — `RescanImportsCard` still says "PDF-only imports need to be uploaded again" though PDF-in-email is supported; undermines trust after re-forward.
3. **Re-scan eligibility is opaque** — `rescannableCount` requires 80+ chars of `originalEmailText`; trips with `sourceEmailId` but truncated/missing PDF section show "No saved email source" until backfill runs server-side.
4. **Multi-leg ITA still brittle** — per-leg pricing needs confirmation code, flight number, or airport pair on each reservation; misparsed legs without airports fall back to whole-email parse and miss Volare miles + EUR taxes.
5. **Image-only PDFs fail silently** — `pdf-parse` returns empty; no prompt to upload screenshot or use ticket scan.
6. **Trip health → fix path is indirect** — "Add cost" on Book/Flights doesn't deep-link to Re-scan or forward address with one tap.

## Ranked improvements

| # | Item | Files | Size | Risk | Owner bot |
|---|------|-------|------|------|-----------|
| **1** | Update Re-scan card + Trip health copy; show "PDF attached / parsed" on reservation detail when `hasPdfAttachment` or PDF marker in source | `RescanImportsCard.tsx`, `ReservationQuickLinks.tsx`, `TripHealthStrip.tsx` | small | low | flight |
| **2** | When `missingPriceCount > 0` and any reservation has `sourceEmailId`, Home/Book CTA → "Re-scan confirmations" (not just generic Book) | `TripHealthStrip.tsx`, `page.tsx`, `FlightsTab.tsx` | small | low | flight |
| **3** | On re-scan / email receive, persist lightweight `pricingParseStatus` (`ok` / `miles_only` / `needs_pdf` / `failed`) so UI explains failure mode | `rescanTripImports.ts`, `email-forward/receive/route.ts`, reservation type | medium | low | flight |
| **4** | Ensure every accepted import stores `flightDepartureAirport` / `flightArrivalAirport` from parser for ITA multi-leg | `emailForwardParser.ts`, `prepareReviewDraftForAccept.ts` | medium | low | flight |
| **5** | Image PDF fallback: if `pdf-parse` empty and attachment present, queue review item with "Scan this PDF" using existing `extractConfirmationDocument` | `receivedEmailPdfText.ts`, `email-forward/receive/route.ts` | large | medium | flight |

## No-go / needs-sign-off

- Changing Resend webhook auth or inbound email routing
- Storing full PDF binaries in Redis (size/cost)
- Auto-overwriting user-edited `quotedPriceUsd` without explicit user action

## Also noticed

- `app-sitter/europe-2026-prod-pass.spec.ts` is the right acceptance harness for Week 1 fixes — add assertions for priced ITA legs when test fixtures include PDF text.
- Week 3 will cover whether priced award legs display miles + EUR clearly (points bot).

## Next week's focus (per rotation)

**Week 2:** Trip-state engine & disruption handling — lifecycle accuracy, phase detection, recovery flows.

**Decision pending:** Jeff picks what to build (e.g. "build #1" or "build #2").
