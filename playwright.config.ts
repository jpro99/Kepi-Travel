import { defineConfig, devices } from '@playwright/test';
import { buildE2eWebServerEnv, loadE2eEnv } from './src/lib/test/loadE2eEnv';

loadE2eEnv();

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001';
const shouldStartServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER !== '1';
const projects = process.env.PLAYWRIGHT_FIREFOX === '1'
  ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }]
  : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }];

const isCi = Boolean(process.env.CI);
const webServerReadyMs = 120_000;
const suiteGlobalTimeoutMs = isCi ? 10 * 60 * 1000 : 0;

export default defineConfig({
  testDir: './app-sitter',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: isCi ? 1 : undefined,
  reporter: 'html',
  timeout: 120_000,
  globalTimeout: suiteGlobalTimeoutMs,
  expect: {
    timeout: 20_000,
  },

  webServer: shouldStartServer ? {
    command: 'npx next dev -p 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !isCi,
    timeout: webServerReadyMs,
    env: buildE2eWebServerEnv(),
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
