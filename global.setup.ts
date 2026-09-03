import * as path from 'path';
import { request, FullConfig } from '@playwright/test';
import { clerkSetup } from '@clerk/testing/playwright';
import { hasRealClerkKeysForE2e, loadE2eEnv } from './src/lib/test/loadE2eEnv';

loadE2eEnv();

async function globalSetup(config: FullConfig) {
  if (hasRealClerkKeysForE2e()) {
    // Fetches a testing token from the Clerk Backend API so sign-in isn't blocked as a bot.
    await clerkSetup({ dotenv: false });
  } else {
    console.warn(
      '[e2e] Clerk secrets missing or mock (.env.test) — skipping clerkSetup(); specs using clerk.signIn need CI secrets.',
    );
  }

  const { baseURL } = config.projects[0].use;
  // Legacy NextAuth bridge — harmless leftover from before this app used Clerk; kept only so
  // older app-sitter specs relying on storageState.json existing don't fail outright.
  const requestContext = await request.newContext();
  await requestContext.post(`${baseURL}/api/test/session`).catch(() => {});
  await requestContext.storageState({ path: 'storageState.json' });
  await requestContext.dispose();
}

export default globalSetup;
