import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseForwardedEmail } from "@/lib/travelAssistant/emailForwardParser";
import { EMAIL_FORWARD_PARSER_VERSION } from "@/lib/travelAssistant/mlReadiness/parserVersion";

type HoldoutFixture = {
  id: string;
  subject: string;
  body: string;
  expected: Record<string, string>;
};

const FIXTURE_DIR = path.join(process.cwd(), "src/lib/travelAssistant/__fixtures__/parse-eval");

function loadFixtures(): HoldoutFixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), "utf8")) as HoldoutFixture);
}

test("parse eval holdout fixtures remain stable (regex path, no AI key required)", async () => {
  const fixtures = loadFixtures();
  assert.ok(fixtures.length >= 2, "Expected at least two held-out parse fixtures.");

  for (const fixture of fixtures) {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "";
    const result = await parseForwardedEmail({
      subject: fixture.subject,
      text: fixture.body,
    });
    if (previousKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousKey;
    }

    assert.equal(result.parserVersion, EMAIL_FORWARD_PARSER_VERSION, `${fixture.id}: parserVersion`);
    assert.equal(result.usedAiFallback, false, `${fixture.id}: should not require AI fallback`);

    for (const [field, expectedValue] of Object.entries(fixture.expected)) {
      const actual = (result.draft as unknown as Record<string, unknown>)[field];
      assert.equal(actual, expectedValue, `${fixture.id}: ${field}`);
    }
  }
});
