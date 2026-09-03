import { request, FullConfig } from '@playwright/test';
import { clerkSetup } from '@clerk/testing/playwright';
import { hasRealClerkKeysForE2e, loadE2eEnv, withE2eSetupTimeout } from './src/lib/test/loadE2eEnv';

loadE2eEnv();

const CLERK_SETUP_TIMEOUT_MS = 90_000;
const SESSION_BOOTSTRAP_TIMEOUT_MS = 30_000;

async function globalSetup(config: FullConfig) {
  if (hasRealClerkKeysForE2e()) {
    // Fetches a testing token from the Clerk Backend API so sign-in isn't blocked as a bot.
    await withE2eSetupTimeout('clerkSetup', CLERK_SETUP_TIMEOUT_MS, () =>
      clerkSetup({ dotenv: false }),
    );
  } else {
    console.warn(
      '[e2e] Clerk secrets missing or mock (.env.test) — skipping clerkSetup(); specs using clerk.signIn need CI secrets.',
    );
  }

  const { baseURL } = config.projects[0].use;
  // Legacy NextAuth bridge — harmless leftover from before this app used Clerk; kept only so
  // older app-sitter specs relying on storageState.json existing don't fail outright.
  await withE2eSetupTimeout('session bootstrap', SESSION_BOOTSTRAP_TIMEOUT_MS, async () => {
    const requestContext = await request.newContext();
    try {
      await requestContext.post(`${baseURL}/api/test/session`, { timeout: 15_000 }).catch(() => {});
      await requestContext.storageState({ path: 'storageState.json' });
    } finally {
      await requestContext.dispose();
    }
  });
}

export default globalSetup;
