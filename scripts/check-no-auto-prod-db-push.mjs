import { globSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const filesToCheck = [
  'package.json',
  ...globSync('.github/workflows/*.{yml,yaml}', { cwd: repoRoot }),
];

const commandSeparatorPattern = /&&|\|\||;|\|/g;
const remoteDbPushReason = 'Automatické `supabase db push` bez `--local` nesmí být součástí běžného CI/CD ani npm skriptů.';
const remoteLinkReason = 'Automatické linkování na vzdálený Supabase projekt by mohlo nechtěně připravit produkční migraci.';

function splitShellCommandSegments(line) {
  const segments = [];
  let segmentStart = 0;

  for (const match of line.matchAll(commandSeparatorPattern)) {
    segments.push(line.slice(segmentStart, match.index));
    segmentStart = match.index + match[0].length;
  }

  segments.push(line.slice(segmentStart));
  return segments;
}

export function findForbiddenAutomationInLine(line) {
  const findings = [];
  const segments = splitShellCommandSegments(line);

  for (const segment of segments) {
    if (/supabase\s+db\s+push\b/i.test(segment) && !/--local\b/i.test(segment)) {
      findings.push({
        reason: remoteDbPushReason,
        text: segment.trim(),
      });
    }

    if (/supabase\s+link\b/i.test(segment)) {
      findings.push({
        reason: remoteLinkReason,
        text: segment.trim(),
      });
    }
  }

  return findings;
}

export function findForbiddenAutomationInFile(file, content) {
  const findings = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    for (const finding of findForbiddenAutomationInLine(line)) {
      findings.push({
        file,
        line: index + 1,
        ...finding,
      });
    }
  });

  return findings;
}

function runGuard() {
  const findings = [];

  for (const file of filesToCheck) {
    const absolutePath = join(repoRoot, file);
    const content = readFileSync(absolutePath, 'utf8');

    findings.push(
      ...findForbiddenAutomationInFile(relative(repoRoot, absolutePath), content),
    );
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGuard();
}
