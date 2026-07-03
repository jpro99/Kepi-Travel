import { config as loadEnv } from 'dotenv';
import * as path from 'path';
import { request, FullConfig } from '@playwright/test';
import { clerkSetup } from '@clerk/testing/playwright';

loadEnv({ path: path.resolve(__dirname, '.env.local') });

async function globalSetup(config: FullConfig) {
  // Required once before any test calls clerk.signIn()/setupClerkTestingToken — fetches a
  // testing token from the Clerk Backend API so sign-in isn't blocked as a bot in headless runs.
  await clerkSetup();

  const { baseURL } = config.projects[0].use;
  // Legacy NextAuth bridge — harmless leftover from before this app used Clerk; kept only so
  // older app-sitter specs relying on storageState.json existing don't fail outright.
  const requestContext = await request.newContext();
  await requestContext.post(`${baseURL}/api/test/session`).catch(() => {});
  await requestContext.storageState({ path: 'storageState.json' });
  await requestContext.dispose();
}

export default globalSetup;
