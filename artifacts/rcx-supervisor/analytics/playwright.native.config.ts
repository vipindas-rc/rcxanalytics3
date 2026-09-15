import { defineConfig, devices } from '@playwright/test'

process.env.ANALYTICS_E2E_MODE = 'native'

const executablePath = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:80',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'native-chrome',
    use: {
      ...devices['Desktop Chrome'],
      ...(executablePath
        ? { browserName: 'chromium' as const, launchOptions: { executablePath } }
        : { channel: 'chrome' }),
    },
  }],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'output/playwright/native-e2e-results',
})