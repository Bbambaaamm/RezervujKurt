import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const configPath = resolve(projectRoot, 'supabase/config.toml');
const envPath = resolve(projectRoot, '.env.local');
const dryRun = process.argv.includes('--dry-run');

function requireCodespacesValue(name, pattern) {
  const value = process.env[name]?.trim();

  if (!value || !pattern.test(value)) {
    throw new Error(`Chybí nebo má neplatný formát proměnná ${name}. Příkaz spusťte uvnitř GitHub Codespaces.`);
  }

  return value;
}

function escapeTomlString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function upsertSectionString(source, sectionName, key, value) {
  const sectionPattern = new RegExp(`(^\\[${sectionName}\\]\\n)([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, 'm');
  const sectionMatch = source.match(sectionPattern);
  const serializedValue = `"${escapeTomlString(value)}"`;

  if (!sectionMatch) {
    return `${source.trimEnd()}\n\n[${sectionName}]\n${key} = ${serializedValue}\n`;
  }

  const sectionBody = sectionMatch[2];
  const keyPattern = new RegExp(`^${key}\\s*=.*$`, 'm');
  const nextBody = keyPattern.test(sectionBody)
    ? sectionBody.replace(keyPattern, `${key} = ${serializedValue}`)
    : `${key} = ${serializedValue}\n${sectionBody}`;

  return source.replace(sectionPattern, `${sectionMatch[1]}${nextBody}`);
}

function addAuthRedirectUrls(source, urls) {
  const authSectionPattern = /(^\[auth\]\n)([\s\S]*?)(?=^\[|(?![\s\S]))/m;
  const authSectionMatch = source.match(authSectionPattern);

  if (!authSectionMatch) {
    throw new Error('V supabase/config.toml chybí sekce [auth].');
  }

  const redirectPattern = /^additional_redirect_urls\s*=\s*\[([\s\S]*?)^\]/m;
  const redirectMatch = authSectionMatch[2].match(redirectPattern);

  if (!redirectMatch) {
    throw new Error('V sekci [auth] chybí additional_redirect_urls.');
  }

  const existingUrls = [...redirectMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const uniqueUrls = [...new Set([...urls, ...existingUrls])];
  const serializedUrls = uniqueUrls.map((url) => `  "${escapeTomlString(url)}"`).join(',\n');
  const nextAuthBody = authSectionMatch[2].replace(redirectPattern, `additional_redirect_urls = [\n${serializedUrls}\n]`);

  return source.replace(authSectionPattern, `${authSectionMatch[1]}${nextAuthBody}`);
}

function upsertEnvValues(source, values) {
  let result = source.trimEnd();

  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const keyPattern = new RegExp(`^${key}=.*$`, 'm');
    result = keyPattern.test(result) ? result.replace(keyPattern, line) : `${result}${result ? '\n' : ''}${line}`;
  }

  return `${result}\n`;
}

function runSupabaseCommand(command) {
  const result = spawnSync('npx', ['supabase', command], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Příkaz npx supabase ${command} skončil s kódem ${result.status ?? 'neznámým'}.`);
  }
}

const codespaceName = requireCodespacesValue('CODESPACE_NAME', /^[a-z0-9][a-z0-9-]*$/i);
const forwardingDomain = requireCodespacesValue('GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN', /^[a-z0-9.-]+$/i);
const appOrigin = `https://${codespaceName}-3000.${forwardingDomain}`;
const apiOrigin = `https://${codespaceName}-54321.${forwardingDomain}`;
const redirectUrl = `${appOrigin}/rezervace`;
const originalConfig = readFileSync(configPath, 'utf8');
const originalEnv = (() => {
  try {
    return readFileSync(envPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  }
})();

let codespacesConfig = upsertSectionString(originalConfig, 'api', 'external_url', apiOrigin);
codespacesConfig = upsertSectionString(codespacesConfig, 'auth', 'site_url', appOrigin);
codespacesConfig = addAuthRedirectUrls(codespacesConfig, [appOrigin, redirectUrl]);

for (const expectedValue of [apiOrigin, appOrigin, redirectUrl]) {
  if (!codespacesConfig.includes(`\"${expectedValue}\"`)) {
    throw new Error(`Nepodařilo se připravit Codespaces konfiguraci pro ${expectedValue}.`);
  }
}

if (dryRun) {
  console.info('Codespaces konfigurace je platná.');
  console.info(`Supabase API: ${apiOrigin}`);
  console.info(`Auth redirect: ${redirectUrl}`);
  process.exit(0);
}

const nextEnv = upsertEnvValues(originalEnv, {
  NEXT_PUBLIC_SUPABASE_URL: apiOrigin,
  NEXT_PUBLIC_SUPABASE_REDIRECT_URL: redirectUrl,
  NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL: redirectUrl,
});

writeFileSync(envPath, nextEnv);
writeFileSync(configPath, codespacesConfig);

try {
  runSupabaseCommand('stop');
  runSupabaseCommand('start');
} finally {
  writeFileSync(configPath, originalConfig);
}

console.info('\nSupabase byla spuštěna s veřejnou Codespaces URL pro magic link.');
console.info(`Supabase API: ${apiOrigin}`);
console.info(`Auth redirect: ${redirectUrl}`);
console.info('Soubor .env.local byl aktualizován; před dalším testem restartujte npm run dev.');
console.info('V Codespaces nastavte porty 3000 a 54321 na Public a poté si vyžádejte nový magic link.');
