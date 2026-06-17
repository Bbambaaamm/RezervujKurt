import { spawnSync } from 'node:child_process';
import { assertLocalE2eSupabaseEnv, loadE2eLocalEnv } from './e2e-local-env.mjs';

const envResult = loadE2eLocalEnv();
if (!envResult.loaded) {
  console.warn('Varování: .env.test.local nebyl nalezen, použijí se pouze proměnné z aktuálního shellu.');
}

assertLocalE2eSupabaseEnv();

function runStep(label, args, extraEnv = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync('npx', args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runStep('Příprava member/admin Playwright session', ['playwright', 'test', 'e2e/smoke.auth-bootstrap.spec.ts'], {
  PLAYWRIGHT_ENABLE_AUTH_SETUP: '1',
});
runStep('Kompletní lokální Playwright E2E běh', ['playwright', 'test']);
