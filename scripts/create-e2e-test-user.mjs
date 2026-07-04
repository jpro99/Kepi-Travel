// One-off script: create a dedicated Clerk test user for e2e auth, separate from real accounts.
// Usage: node scripts/create-e2e-test-user.mjs
import { config } from "dotenv";
import { createClerkClient } from "@clerk/backend";

config({ path: ".env.local" });

const EMAIL = "kepi-e2e-test@example.com";
const PASSWORD = "Kepi-E2E-Test-Pass-2026!";

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY not set in .env.local");

  const clerk = createClerkClient({ secretKey });

  const existing = await clerk.users.getUserList({ emailAddress: [EMAIL] });
  if (existing.data.length > 0) {
    console.log("Test user already exists:", existing.data[0].id);
    console.log("EMAIL=" + EMAIL);
    console.log("PASSWORD=" + PASSWORD);
    return;
  }

  const user = await clerk.users.createUser({
    emailAddress: [EMAIL],
    password: PASSWORD,
    firstName: "Kepi",
    lastName: "E2E Test",
    skipPasswordChecks: true,
  });

  console.log("Created test user:", user.id);
  console.log("EMAIL=" + EMAIL);
  console.log("PASSWORD=" + PASSWORD);
}

main().catch((err) => {
  console.error("Failed to create test user:", err?.errors ?? err);
  process.exit(1);
});
