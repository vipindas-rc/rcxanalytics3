import { defineConfig, devices } from '@playwright/test'

process.env.ANALYTICS_E2E_MODE = 'standalone'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chrome', use: {
    ...devices['Desktop Chrome'],
    ...(process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
      : { channel: 'chrome' }),
  } }],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'output/playwright/test-results',
})
