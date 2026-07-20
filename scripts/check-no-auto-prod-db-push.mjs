import { globSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const filesToCheck = [
  'package.json',
  ...globSync('.github/workflows/*.{yml,yaml}', { cwd: repoRoot }),
];

const forbiddenPatterns = [
  {
    pattern: /supabase\s+db\s+push(?![^\n]*--local)/i,
    reason: 'Automatické `supabase db push` bez `--local` nesmí být součástí běžného CI/CD ani npm skriptů.',
  },
  {
    pattern: /supabase\s+link\b/i,
    reason: 'Automatické linkování na vzdálený Supabase projekt by mohlo nechtěně připravit produkční migraci.',
  },
];

const findings = [];

for (const file of filesToCheck) {
  const absolutePath = join(repoRoot, file);
  const content = readFileSync(absolutePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    for (const { pattern, reason } of forbiddenPatterns) {
      if (pattern.test(line)) {
        findings.push({
          file: relative(repoRoot, absolutePath),
          line: index + 1,
          reason,
          text: line.trim(),
        });
      }
    }
  });
}

if (findings.length > 0) {
  console.error('Nalezena zakázaná automatizace produkčních Supabase migrací:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.reason}`);
    console.error(`  ${finding.text}`);
  }
  process.exit(1);
}

console.log('OK: běžné CI/CD a npm skripty nespouští produkční Supabase migrace automaticky.');
