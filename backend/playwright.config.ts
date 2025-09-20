import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests/e2e',
  timeout: 60000,
  use: {
    ignoreHTTPSErrors: true
  },
  projects: [
    {
      name: 'api',
      testMatch: /.*\.e2e\.spec\.ts/
    }
  ]
});
