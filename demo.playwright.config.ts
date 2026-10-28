import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './demos',
  testMatch: 'photoforge.demo.spec.ts',
  timeout: 360000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  outputDir: process.env.DEMO_RUN_DIR ?? 'test-results/demo',
  expect: { timeout: 20000 },
  use: {
    baseURL: process.env.DEMO_BASE_URL ?? 'https://photoforge-chirag.duckdns.org',
    viewport: { width: 1440, height: 900 },
    video: { mode: 'on', size: { width: 1440, height: 900 } },
    screenshot: 'only-on-failure',
    trace: 'off',
    acceptDownloads: true,
    actionTimeout: 20000,
    navigationTimeout: 45000,
    launchOptions: { slowMo: 140 },
  },
});
