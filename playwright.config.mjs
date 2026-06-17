import { defineConfig, devices } from 'playwright/test';
import { loadE2eLocalEnv } from './scripts/e2e-local-env.mjs';

loadE2eLocalEnv();

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const supabaseURL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://responsive-test.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'responsive-test-anon-key';

const globalSetup = process.env.PLAYWRIGHT_ENABLE_AUTH_SETUP === '1' ? './e2e/global-setup.ts' : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 1,
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  globalSetup,
  webServer: {
    command: 'npm run dev',
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: supabaseURL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    },
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
