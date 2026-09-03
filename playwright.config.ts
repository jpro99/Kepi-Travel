import { defineConfig, devices } from '@playwright/test';
import { hasRealClerkKeysForE2e, loadE2eEnv } from './src/lib/test/loadE2eEnv';

loadE2eEnv();

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001';
const shouldStartServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER !== '1';
const projects = process.env.PLAYWRIGHT_FIREFOX === '1'
  ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }]
  : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }];

const clerkUrlEnv = {
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? '/sign-in',
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? '/sign-up',
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL ?? '/travel-assistant',
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL ?? '/travel-assistant',
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'e2e-nextauth-secret',
};

/** Pass real Clerk keys to Next only when CI secrets are present — mock "test" keys crash middleware. */
const clerkWebEnv = hasRealClerkKeysForE2e()
  ? {
      ...clerkUrlEnv,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    }
  : clerkUrlEnv;

export default defineConfig({
  testDir: './app-sitter',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },

  webServer: shouldStartServer ? {
    command: 'npx next dev -p 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    env: clerkWebEnv,
  } : undefined,

  // Run the global setup file before all tests
  globalSetup: require.resolve('./global.setup.ts'),

  use: {
    baseURL,
    trace: 'on-first-retry',

    // Use the saved storage state for all tests
    storageState: 'storageState.json',
  },

  projects,
});
