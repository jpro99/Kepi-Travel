# Hotel bot memory

Owns: `/api/hotels/*`, stay profile, trip segments, LiteAPI, Duffel Stays fallback, Hotels tab UX.

## Provider status

- **Duffel Stays:** Not enabled (403). Owner already emailed support multiple times — do not re-suggest.
- **LiteAPI:** Key on Vercel as `LITEAPI_KEY`; wired in `src/lib/providers/liteapi/searchHotels.ts`
- **Travelpayouts:** Skipped (no Drive install)

## Product state

- Stay profile API + UI live in codebase
- Trip stay planner on Hotels tab
- Ranking uses profile + genome + memory

## Test focus

- Monopoli / Monopoly alias searches
- Real photos when LiteAPI returns data

## Changelog

| Date | Note |
|------|------|
| 2026-06-15 | LiteAPI waterfall added |
