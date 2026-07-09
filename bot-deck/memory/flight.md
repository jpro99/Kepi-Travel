# Flight bot memory

Owns: Duffel air search, Flights tab, flight status polling, loyalty CPP on flights.

## Provider status

- **Duffel flights:** Live via `DUFFEL_ACCESS_TOKEN`

## Integration

- Flight arrivals feed hotel stay segment planner (city + dates)
- Email forward + PDF pricing: `receivedEmailPdfText.ts`, `rescanTripImports.ts`, `parseReservationCashUsd.ts`
- Week 1 Weekly Audit (2026-07-06): see `../audits/2026-07-06-week01-ingestion.md`

## Changelog

| Date | Note |
|------|------|
| 2026-07-06 | PDF-in-email pricing + per-leg parse shipped; audit Week 1 logged |
| 2026-06-15 | Bot Deck initialized |
