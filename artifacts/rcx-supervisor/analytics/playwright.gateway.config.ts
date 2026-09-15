import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE

export default defineConfig({
  testDir: './tests/gateway',
  reporter: 'list',
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5019',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chrome',
    use: {
      ...devices['Desktop Chrome'],
      ...(executablePath
        ? { browserName: 'chromium' as const, launchOptions: { executablePath } }
        : { channel: 'chrome' }),
    },
  }],
})