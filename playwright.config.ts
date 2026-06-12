import { defineConfig, devices } from '@playwright/test';

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

  webServer: {
    command: 'npx next dev -p 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
  },

  // Run the global setup file before all tests
  globalSetup: require.resolve('./global.setup.ts'),

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',

    // Use the saved storage state for all tests
    storageState: 'storageState.json',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
