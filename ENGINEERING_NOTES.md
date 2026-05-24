# Kepi Engineering Notes — Email Forwarding Build

## Problem 1: Webhook signature always failing
- **Symptom:** Every webhook returned 200 but logs showed "Signature mismatch"
- **Root cause:** Code was comparing the HMAC signature string directly against the secret key using `===` — these are completely different things
- **Fix:** Use svix Webhook class: `new Webhook(secret).verify(rawBody, headers)`

## Problem 2: Redis silently falling back to per-lambda memory
- **Symptom:** Data written in one request was invisible to the next request
- **Root cause:** `hasRedisEnvConfig()` only checked for `UPSTASH_REDIS_*` vars but Vercel KV uses `KV_REST_API_*` vars — so Redis was treated as missing
- **Fix:** Check BOTH `UPSTASH_REDIS_*` AND `KV_REST_API_*` env vars

## Problem 3: Email body always empty
- **Symptom:** Parser received empty text/html, AI could not extract anything
- **Root cause:** Resend `email.received` webhook payload does NOT include the email body — only metadata like `email_id`, `from`, `to`, `subject`
- **Fix:** When body is empty but `emailId` exists, fetch full content via `resend.emails.receiving.get(emailId)`

## Problem 4: Handle->userId lookup always returning null
- **Symptom:** Webhook resolved signature fine but failed with "Unable to resolve target user"
- **Root cause:** `ensureForwardHandle` was not writing the `handleOwnerKey -> userId` mapping under `EMAIL_HANDLE_SYSTEM_NAMESPACE` correctly
- **Fix:** Explicitly write `handleOwnerKey(handle) -> userId` under `EMAIL_HANDLE_SYSTEM_NAMESPACE` in `ensureForwardHandle`, with read-after-write verification

## Problem 5: Recipient address not found in email
- **Symptom:** `recipientCandidates: []` — webhook could not find `jpro99@trips.kepitravel.com`
- **Root cause:** Code only checked the `to` field — but forwarded emails may have the kepitravel address in `cc` or `envelope` instead
- **Fix:** Extract recipient candidates from `to`, `cc`, AND `envelope` fields, plus `data.to`, `data.cc`, `data.envelope`

## Problem 6: Duplicate detection dropping everything
- **Symptom:** Valid new reservations silently dropped before reaching review queue
- **Root cause:** Composite duplicate match compared empty/null strings — so two reservations with no data matched each other
- **Fix:** Only flag as duplicate if both records have full non-empty signal on `type+provider+localTime+location`, or matching non-empty `confirmationCode`

## Problem 7: Webhook payload fields nested under data.*
- **Symptom:** `from`, `to`, `subject`, `email_id` all read as undefined
- **Root cause:** Resend nests all fields under `data` object — code was reading top-level only
- **Fix:** Normalize payload by reading both top-level and `data.*` fields

## Problem 8: Preview vs Production deployment confusion
- **Symptom:** Logging fixes not appearing in production logs
- **Root cause:** Cursor commits went to feature branches deployed as Preview — not production
- **Fix:** Always push directly to main. Never create PRs unless explicitly asked.

## Key env vars required
- `RESEND_WEBHOOK_SECRET` — must match exactly what Resend shows in webhook settings
- `RESEND_API_KEY` — for fetching email body
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — or `KV_REST_API_*` equivalents
- `ANTHROPIC_API_KEY` — for AI email parsing
- `AVIATIONSTACK_API_KEY` — for flight status lookup
- `CLERK_SECRET_KEY` — for auth
