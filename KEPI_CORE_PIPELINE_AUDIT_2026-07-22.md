# Kepi Core Trip Pipeline Audit — 2026-07-22

**Scope:** Whole-trip execution pipeline (email forward → parse → gate → duplicates → review → trip attach), bug-report pipeline, i18n, baseline health.  
**Out of scope (standing Jeff decision):** New airports, new M-laws under airport maps, `osmImport.ts`, `controlPointTransform.ts`, `layouts/`, `.cursor/skills/kepi-airport-bot/`. SEA remains the showcase; LAX/ONT stay schematic/partial.  
**Mode:** Audit / discuss-before-code. No broad refactor. No production code changes in this pass.  
**Method:** Read `ENGINEERING_NOTES.md`, `AGENTS.md`, `CLAUDE.md`, `KEPI_PROJECT_MEMORY.md`; cite live source + commands run this session.

---

## Top-line summary

| Area | Verdict |
|------|---------|
| Historical ENGINEERING_NOTES fixes 1–5, 7–8 | **Still in place** |
| Problem 6 (empty-signal duplicates) | **Fragile** — webhook local helper fixed; shared `reservationDuplicates.ts` not |
| Silent promotion / silent drop in ingest | **Several verified high/critical gaps** (enrich-before-gate, `needs-review` not held, day-plan kills bookings, out-of-window drops) |
| Bug-report → GitHub issue + SMS | **Not live** — zero GH issues ever; `GITHUB_TOKEN` / Twilio / owner phone absent from Vercel + local `.env.local` |
| i18n catalogs | **Key parity perfect**; real gap is hardcoded English in travel-assistant |
| Baseline | `lint` pass · `test:laws` pass (426) · `build` pass · **`typecheck` FAIL** |

**Top 3 recommended next fixes (Jeff pick order):**

1. **Gate before enrich + hold `needs-review` + honor `missingFields`** — stops fabricated dates/locations becoming live trip fact.  
2. **Wire bug-report env (`GITHUB_TOKEN`, Twilio, `OWNER_PHONE_NUMBER`) and verify one real issue + SMS** — pipeline code exists but cannot fire.  
3. **Queue (don’t drop) out-of-window drafts; still import/queue bookings when a day-plan is detected** — stops real confirmations vanishing.

---

## 1. ENGINEERING_NOTES.md Problems 1–8 — regression check

| # | Problem | Status | Evidence |
|---|---------|--------|----------|
| 1 | Webhook signature vs secret string | **STILL_FIXED** (fragile if secret missing) | `receive/route.ts` imports `Webhook` from `svix`; `verifyResendWebhookSignature` uses `webhook.verify(rawBody, headers)`. If `RESEND_WEBHOOK_SECRET` unset → returns `true` (skip). Prod Vercel **has** `RESEND_WEBHOOK_SECRET` (verified `vercel env ls`). Local `.env.local` missing it. |
| 2 | Redis only checked `UPSTASH_*` | **STILL_FIXED** | `src/lib/redis.ts` — `REDIS_URL_ENV_KEYS` / `REDIS_TOKEN_ENV_KEYS` include `UPSTASH_REDIS_*` and `KV_REST_API_*`; `hasRedisEnvConfig()` requires both. |
| 3 | Empty email body (webhook metadata only) | **STILL_FIXED** | `receive/route.ts` ~553–591 — when `emailId` present and body empty, `resend.emails.receiving.get(emailId)`. Needs `RESEND_API_KEY`. |
| 4 | Handle → userId null | **STILL_FIXED** | `emailForwardSetupStore.ts` — `EMAIL_HANDLE_SYSTEM_NAMESPACE`, `setHandleOwner` read-after-write, `ensureForwardHandle`, `resolveUserIdByForwardAddress` + repair. |
| 5 | Recipients only from `to` | **STILL_FIXED** | `extractRecipientCandidates` + normalize from `to`/`cc`/`envelope` and `data.*` (`receive/route.ts` ~175–178, ~316–359, ~470–481). BCC-only still unverified gap. |
| 6 | Empty composite duplicates drop all | **FRAGILE** | Webhook local `isDuplicateReservation` requires `hasFullCompositeSignal` (`receive/route.ts` 262–273). Shared `reservationDuplicates.ts` 73–78 still matches empty provider/time/location. Drain + client use shared helper. |
| 7 | Payload nested under `data.*` | **STILL_FIXED** | `normalizeIncomingWebhookBody` merges root + `data` + `data.email` (`receive/route.ts` ~156–201). |
| 8 | Preview vs production / feature branches | **STILL_FIXED (policy)** | `AGENTS.md` + `CLAUDE.md`: push `main` directly; no PRs unless asked. |

**Highest-priority follow-up from §1:** Unify duplicate logic — move `hasFullCompositeSignal` into `reservationDuplicates.ts`, delete route-local copy, add empty-composite unit test.

---

## 2. Full ingestion path — silent loss / silent promote

### Path (verified)

`POST /api/email-forward/receive` → Svix verify → user resolve → Resend body + PDF/DOCX hydrate → `parseForwardedEmail` → trip resolve (`tripEmailAttach`) → per-draft: window skip → planned replace / dup merge → **`enrichReservationForAutoImport`** → **`evaluateForwardedReservationGate`** → live import or review queue → `drainForwardReviewQueue` → `updateTrip` + push.

### Verified positives

- Confidence &lt; 40 and `needs-user-input` → review (`forwardedReservationGate.ts` 34–40).  
- Plausibility failures held (`checkReservationPlausibility`).  
- Drain **does not** promote items that have `reasons` (`drainForwardReviewQueue.ts` 57–62).  
- Image-based emails confidence-capped ≤20 → review.  
- Day-plan-only `updateTrip` omits `reservations` (won’t wipe bookings on plan-only write).  
- Recent I29 work: legal eTA dates / CAREFULLY PNRs rejected (`emailForwardParser.ts`, tests green this session).

### Ranked findings

#### F1 — Gate after enrich (fabricated fields pass the gate) — **critical** — silent promote

**Evidence:**  
- Enrich then gate: `receive/route.ts` 1082–1113.  
- Enrich invents `localTime` (today `12:00`) and location (`"Hotel stay"` / `"TBD"`): `autoImportReservation.ts` 10–25, 62–75, 87–97.  
- Gate only checks emptiness: `forwardedReservationGate.ts` 42–53.

**Impact:** Incomplete parses can become live reservations with invented check-in/time/location.

**Fix (propose):** Gate on **raw** parsed fields; treat enrich sentinels as missing; never invent travel dates before the review decision.

---

#### F2 — `parsingStatus: "needs-review"` (score 40–69) not held — **high** — silent promote

**Evidence:** Gate blocks only `&lt;40` and `needs-user-input` — not `needs-review` (`forwardedReservationGate.ts` 34–40). Parser emits three statuses (`emailForwardParser.ts`).

**Fix:** Hold `needs-review` (or only auto-import `auto-parsed` / ≥70).

---

#### F3 — `missingFields` ignored by gate — **high** — silent promote

**Evidence:** `missingFields?: string[]` on gate input (`forwardedReservationGate.ts` 20) but never read in body (29–60). Route still passes it (`receive/route.ts` 1112).

**Fix:** If `missingFields?.length`, push a reason.

---

#### F4 — Day-plan forward discards all booking drafts — **high** — silent data loss

**Evidence:**
```ts
// receive/route.ts ~730
const draftsToImport = isDayPlanForward ? [] : parserDraftRecords;
```

**Impact:** Email/Word that is both day plan and confirmation never queues bookings.

**Fix:** Still import/queue booking-shaped drafts; only skip junk.

---

#### F5 — Out-of-window drafts dropped with no queue — **high** — silent data loss

**Evidence:** Skip + `continue` with log only (`receive/route.ts` ~742–754). If nothing else applies → 200 with no `updateTrip` / no review item.

**Fix:** Enqueue with reason `"Outside active trip dates"` (or retarget trip).

---

#### F6 — Planned-leg replace / flight merge bypass gate — **high** — silent promote / overwrite

**Evidence:** Planned replace and duplicate flight merge `continue` before gate (`receive/route.ts` ~898–955 region).

**Fix:** Gate before mutate; queue “proposed update” when `needsReview`.

---

#### F7 — Email-level confidence applied to every draft — **medium**

One score/`missingFields` from primary draft applied in loop (`receive/route.ts` 1102–1112). Strong first leg can launder a weak second (or reverse).

**Fix:** Per-draft score + `missingFieldsFromDraft`.

---

#### F8 — Local dup helper ≠ shared module — **medium** — false duplicate drops

Webhook: confirmation match any type; shared module more nuanced (`reservationDuplicates.ts`). Drain uses shared.

**Fix:** One helper everywhere + tests for shared-PNR hotel+flight.

---

#### F9 — Drain auto-promotes any email item without `reasons` — **medium**

`isAutoImportReviewItem` (`drainForwardReviewQueue.ts` 57–68): no reasons + email-forward/gmail → promote. Correct for gated new items; unsafe for legacy/malformed rows without reasons.

**Fix:** Default-deny unless `parsingStatus === "auto-parsed"` or explicit gate-passed flag.

---

#### F10 — Drain duplicate skip deletes review item silently — **medium**

`drainForwardReviewQueue.ts` 114–117 — `continue` drops from queue with no user surface.

---

#### F11 — Unknown type → `"ride"` may auto-import — **medium**

`receive/route.ts` ~756–764.

---

#### F12 — Soft webhook auth when secret/address missing — **medium** (prod secret present)

Skip-verify if secret unset; body `userId` can win if address resolution fails. Prod has secret; still fail-closed in code for defense in depth.

---

### Related product incidents (already in memory; still relevant)

- Empty-shell trip from day-plan forward (fixed I27 path) — still validate F4.  
- Wrong-year day plan on orphan trip (2026-07-22 merge + date-overlap attach) — separate from booking silent-drop but same “attach to right trip” theme.

---

## 3. Bug-report pipeline — live end-to-end

### Code path (exists)

`BugReportModal.tsx` → `POST /api/support/bug-report` → `classifyBugReport` → `createGitHubIssue` → optional `sendSms` (`OWNER_PHONE_NUMBER` / `JEFF_PHONE_NUMBER`).

### What we verified (not guessed)

| Check | Result |
|-------|--------|
| `gh issue list --repo jpro99/Kepi-Travel --state all` | **Zero issues** (open or closed) |
| Local `.env.local` | `GITHUB_TOKEN` / `BUG_REPORT_GITHUB_TOKEN` **MISSING**; `TWILIO_*` **MISSING**; owner phone keys **MISSING** |
| `vercel env ls` filtered for GITHUB/TWILIO/OWNER/JEFF/BUG_REPORT | **No matches** (pipeline secrets not configured on Vercel) |
| Direct probe `createGitHubIssue(...)` | Logged `GITHUB_TOKEN not set — skipping`; returned `null` |
| Direct probe `sendSms(...)` | Logged `Twilio env vars missing`; returned `false` |

### Verdict

**The pipeline is implemented but not operational.** Zero GitHub issues is explained by missing tokens, not (only) low user volume. UI can still return a “thanks” ticket ID while `issueUrl: null` and `smsSent: false`.

**Cannot** truthfully claim a UI round-trip created an issue/SMS without auth — API requires signed-in user (`401` without). Env evidence is sufficient to conclude GH + SMS cannot succeed in current prod/local config.

**Exact next steps (ops, not code):**

1. Add Vercel Production secrets: `GITHUB_TOKEN` (or `BUG_REPORT_GITHUB_TOKEN`) with `issues:write` on `jpro99/Kepi-Travel`.  
2. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `OWNER_PHONE_NUMBER`.  
3. Submit one bug from Support UI while signed in; confirm issue number + SMS.  
4. Optional: fail API loudly (or surface `issueUrl`/`smsSent` in UI) when filing is skipped so silence is visible.

---

## 4. i18n audit (keys, not line counts)

### Catalog parity

| Bundle | en keys | es keys | Only-en | Only-es |
|--------|---------|---------|---------|---------|
| `messages/en.json` ↔ `es.json` | 271 | 271 | **0** | **0** |
| `messages/consumer/en.json` ↔ `es.json` | 197 | 197 | **0** | **0** |
| Merged (as runtime merge) | 467 | 467 | **0** | **0** |

### Identical Spanish = English (merged ~15)

Mostly brands/acronyms (`Uber`, `PDF`, `Excel`, `Plan`, `Travel Fit`).  
**Clear copy-paste:** `GroundTransport.distanceMi` = `~{miles} mi · {hint}` in both consumer en/es.

### Real gap: hardcoded English (traveler surfaces)

Catalogs are fine; locale is undermined by hardcoding:

| Severity | Surface | Evidence |
|----------|---------|----------|
| high | Confirm drawer | `page.tsx` ~8920 — `"Confirm this booking"`, `"Reservation details"`, `"Close"` |
| high | Plan exports | `ItineraryTabView.tsx` — `"Day plan PDF"` beside `tPlan("pdf")`/`excel` |
| high | Narrative day plan helper | `NarrativeDayPlanView.tsx` — English drag helper |
| high | Toasts | `page.tsx` — large `setToast("…")` English surface |
| high | Airport Mode / Travel Day | No `useTranslations` |
| medium | Family / Share / Planner / Gaps | Hardcoded English |
| medium | Dead keys | `ReservationList.*` exists; component doesn’t call `useTranslations` |

---

## 5. General health check (this session)

| Command | Result |
|---------|--------|
| `npm run lint` | **PASS** (warnings only; exit 0) |
| `npm run typecheck` | **FAIL** (exit 1) — `tripHotelStayMap.ts`, `tripSpendSummary.ts` (`confirmationCode` null vs undefined; missing `id`), `statusProjection.test.ts` (`genomeStatuses` unknown property) |
| `npm run test:laws` | **PASS** — 426 tests, 0 fail, 0 skipped |
| `npm run build` | **PASS** (Next `ignoreBuildErrors: true` — typecheck debt does not block build) |

### TODO / FIXME / stub (src/, excluding known-honest)

| Item | Notes |
|------|-------|
| `src/app/api/ocr/route.ts` | Known honest 501 — “not available yet” |
| Duffel Stays disabled | Known product/provider state |
| `rideStatusProvider.ts` | `TODO: Replace with Uber/Lyft webhook…` + stub failure path |
| Test `stubHotel` helpers | Test-only; not product debt |
| Airport `?iata=XXX` comment | Docs, not a stub |

No new silent OCR fake-data return path found (501 retained).

### Skipped tests

`rg '\.skip\(|test\.todo|xtest\(|describe\.skip|it\.skip' src` → **no matches**. Confirmed.

---

## Prioritized fix list (for Jeff to approve)

| Priority | ID | Fix | Risk | Effort |
|----------|----|-----|------|--------|
| P0 | F1+F2+F3 | Gate on raw fields; hold `needs-review`; use `missingFields` | Medium (behavior tighter) | S–M |
| P0 | Bug-report ops | Set GH + Twilio + owner phone; verify one live issue+SMS | Low (config) | S |
| P1 | F5 | Out-of-window → review queue, never silent drop | Low–Med | S |
| P1 | F4 | Day-plan + booking: queue/import bookings too | Med | S–M |
| P1 | §1 / F8 | Unify `reservationDuplicates` + empty-signal test | Low | S |
| P2 | F6 | Gate planned-replace / merge paths | Med | M |
| P2 | F9 | Drain default-deny without gate-passed | Med | S |
| P2 | typecheck | Fix `tripSpendSummary` / `tripHotelStayMap` / statusProjection test types | Low | S |
| P3 | i18n | Wire drawer/toasts/Day plan PDF; fix `distanceMi` ES; Airport/Travel Day later | Low | M–L |
| P3 | F12 | Fail closed if webhook secret missing in production | Low | S |

---

## What was intentionally not done

- No airport-map / layout / osmImport / M-law work.  
- No broad refactor; no production code push from this audit.  
- No “fix while in there” beyond reporting (duplicate-module unification is a real change — wait for Jeff).

---

## Checks run (this session)

```text
npm run lint          → pass (warnings)
npm run typecheck     → fail (see §5)
npm run test:laws     → pass 426 / 0 fail / 0 skip
npm run build         → pass
gh issue list --repo jpro99/Kepi-Travel --state all → empty
node probe createGitHubIssue / sendSms → both skip (missing env)
vercel env ls → RESEND_WEBHOOK_SECRET present; GITHUB/TWILIO/OWNER phone absent
```

---

## Open questions

1. Should medium-confidence (`needs-review`) always require human confirm, or only when airports/times are missing?  
2. For PDF-only airline receipts (ITA), is “queue with PNR + empty times” the product win, or must PDF OCR/extract block ship until legs exist?  
3. Confirm Jeff’s phone number env key preference (`OWNER_PHONE_NUMBER` vs `JEFF_PHONE_NUMBER`) when wiring Twilio.
