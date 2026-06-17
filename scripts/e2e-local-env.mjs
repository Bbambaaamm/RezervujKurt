import { existsSync, readFileSync } from 'node:fs';

const DEFAULT_ENV_FILE = '.env.test.local';

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return undefined;
  }

  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex === -1) {
    return undefined;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (!key || key.startsWith('export ')) {
    return undefined;
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export function loadE2eLocalEnv(envFile = DEFAULT_ENV_FILE) {
  if (!existsSync(envFile)) {
    return { loaded: false, envFile };
  }

  const content = readFileSync(envFile, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;
    process.env[key] = value;
  }

  return { loaded: true, envFile };
}

export function isLocalSupabaseUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '54321';
  } catch {
    return false;
  }
}

export function assertLocalE2eSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!isLocalSupabaseUrl(supabaseUrl)) {
    throw new Error(
      'Lokální E2E běh vyžaduje NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 nebo http://localhost:54321. ' +
        `Aktuální hodnota: ${supabaseUrl ?? '(nenastaveno)'}`,
    );
  }

  const required = ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Lokální E2E běh postrádá povinné proměnné: ${missing.join(', ')}.`);
  }
}
