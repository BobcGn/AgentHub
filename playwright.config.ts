import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:4318', headless: true, trace: 'retain-on-failure', channel: 'chrome' },
  webServer: { command: 'node --import tsx tests/browser-server.ts', url: 'http://127.0.0.1:4318', reuseExistingServer: false, timeout: 20_000 },
  reporter: 'list'
});
