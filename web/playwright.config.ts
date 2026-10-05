import { defineConfig, devices } from '@playwright/test';

// Smoke test sulla build di produzione (vite preview), con la CSP attiva,
// su desktop e mobile, ciascuno con il browser in italiano e in inglese.
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } };
const mobile = { ...devices['iPhone 13'], browserName: 'chromium' as const, defaultBrowserType: 'chromium' as const };

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173/', trace: 'retain-on-failure' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: true },
  projects: [
    { name: 'desktop-it', use: { ...desktop, locale: 'it-IT' } },
    { name: 'desktop-en', use: { ...desktop, locale: 'en-US' } },
    { name: 'mobile-it', use: { ...mobile, locale: 'it-IT' } },
    { name: 'mobile-en', use: { ...mobile, locale: 'en-US' } },
  ],
});
