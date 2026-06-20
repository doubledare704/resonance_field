import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5678',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: 'node tests/e2e/mock-server.mjs',
    url: 'http://localhost:5678',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'Pixel 5',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 393, height: 851 },
      },
    },
    {
      name: 'iPad',
      use: {
        ...devices['iPad'],
        viewport: { width: 810, height: 1080 },
      },
    },
  ],
});
