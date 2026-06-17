import { spawnSync } from 'node:child_process';
import { assertLocalE2eSupabaseEnv, loadE2eLocalEnv } from './e2e-local-env.mjs';

const envResult = loadE2eLocalEnv();
if (!envResult.loaded) {
  console.warn('Varování: .env.test.local nebyl nalezen, použijí se pouze proměnné z aktuálního shellu.');
}

assertLocalE2eSupabaseEnv();

const result = spawnSync('npx', ['playwright', 'test', 'e2e/smoke.auth-bootstrap.spec.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_ENABLE_AUTH_SETUP: '1',
  },
});

process.exit(result.status ?? 1);
