import { test } from "@playwright/test";

/**
 * Legacy airport navigator tests targeted a demo page (/travel-assistant?iata=SEA)
 * that is no longer wired in production. The production path is Live Map → Airport view.
 *
 * Run the maintained suite instead:
 *   npm run app-sitter -- airport-day-of-travel.spec.ts
 *   npm run app-sitter -- airport-europe-fallback.spec.ts
 */
test.describe.skip("Airport Navigator (migrated to app-sitter)", () => {
  test("see app-sitter/airport-day-of-travel.spec.ts", () => {
    // Intentionally empty — kept so playwright.e2e.config.ts documents the migration.
  });
});
