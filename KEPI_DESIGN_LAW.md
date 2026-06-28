# Kepi Design Law

Permanent product rules for hotel search and display. **Append only — never remove.**
Each law has a matching test in `src/lib/hotels/__tests__/`. If a test fails, the build fails.

When a bug is reported (especially via screenshot): fix it, add a one-line law here, add/update the test.

---

## LAW 1 — No ocean hotels

No hotel may render with coordinates more than **50 km** from the search city center.
Provider bad coords are dropped; synthetic coords stay within the trusted radius.

**Test:** `src/lib/hotels/__tests__/hotelDistance.test.ts`

---

## LAW 2 — Never zero when inventory exists

If the API returns **N > 0** hotels, the UI must display **at least 1**.
If strict filters would hide everything, relax the narrowest filter automatically and show a quiet note:
*"Showing all N — none matched your exact style, ranked closest first."*
Never show an empty apology when inventory exists.

**Test:** `src/lib/hotels/__tests__/hotelSearchFilters.test.ts`

---

## LAW 3 — Every card has a hero image

Every hotel card must show a photo **or** a branded gradient fallback with hotel initials.
No broken image icons. No empty image boxes.

**Test:** `src/lib/hotels/__tests__/hotelCardDisplay.test.ts`

---

## LAW 4 — No broken price display

No result may render with `"undefined"`, `"NaN"`, or an empty price label.
Browse-only / missing rates show **"Check site"**, never raw bad values.

**Test:** `src/lib/hotels/__tests__/hotelCardDisplay.test.ts`

---

## LAW 5 — Stay style is opt-in hard filter

Saved stay-profile preferences rank and explain matches but do **not** hard-hide all results
until the traveler taps **Refine → Apply**. Hard style filters never run on profile load alone.

**Test:** `src/lib/hotels/__tests__/hotelSearchFilters.test.ts`
