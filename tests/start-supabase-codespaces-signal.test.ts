import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = process.cwd();
const helperPath = join(projectRoot, 'scripts/start-supabase-codespaces.mjs');

const originalConfig = `project_id = "test"\n\n[auth]\nsite_url = "http://localhost:3000"\nadditional_redirect_urls = [\n  "http://localhost:3000"\n]\n`;

test('Codespaces helper po SIGINT obnoví původní Supabase konfiguraci', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'rezervujkurt-codespaces-'));
  const supabaseDirectory = join(fixtureRoot, 'supabase');
  const binDirectory = join(fixtureRoot, 'bin');
  const configPath = join(supabaseDirectory, 'config.toml');
  const markerPath = join(fixtureRoot, 'npx-started');

  await mkdir(supabaseDirectory, { recursive: true });
  await mkdir(binDirectory, { recursive: true });
  await writeFile(configPath, originalConfig);

  const fakeNpxPath = join(binDirectory, 'npx');
  await writeFile(fakeNpxPath, `#!/bin/sh\ntouch "${markerPath}"\ntrap 'exit 130' INT\ntrap 'exit 143' TERM\nwhile true; do sleep 1; done\n`);
  await chmod(fakeNpxPath, 0o755);

  const child = spawn(process.execPath, [helperPath], {
    env: {
      ...process.env,
      CODESPACE_NAME: 'test-space',
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
      PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
      REZERVUJKURT_PROJECT_ROOT: fixtureRoot,
    },
    stdio: 'ignore',
  });

  try {
    await waitFor(async () => {
      const config = await readFile(configPath, 'utf8');
      return config.includes('https://test-space-54321.app.github.dev');
    });
    await waitFor(async () => readFile(markerPath, 'utf8').then(() => true, () => false));

    const exitPromise = waitForExit(child);
    child.kill('SIGINT');
    const result = await exitPromise;

    assert.equal(result.code, 130);
    assert.equal(await readFile(configPath, 'utf8'), originalConfig);
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }

  throw new Error('Vypršel čas při čekání na testovací stav Codespaces helperu.');
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
}
