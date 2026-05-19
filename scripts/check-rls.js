#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const mode = process.env.RLS_RELEASE_MODE === 'prod' ? 'prod' : 'dev';

const devOnlyPolicies = [
  {
    name: 'reservations_select_public_overview_anon',
    reason: 'Anonymní SELECT na reservations nesmí být aktivní v produkci.'
  }
];

function readMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Chybí složka migrací: ${migrationsDir}`);
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

function containsPolicyDefinition(sql, policyName) {
  const createPolicyRegex = new RegExp(`create\\s+policy\\s+"${policyName}"`, 'i');
  return createPolicyRegex.test(sql);
}

function hasDevOnlyMarker(sql, policyName) {
  const markerRegex = new RegExp(`--\\s*DEV_ONLY_POLICY:\\s*${policyName}`, 'i');
  return markerRegex.test(sql);
}

const files = readMigrationFiles();
const findings = [];

for (const file of files) {
  const fullPath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(fullPath, 'utf8');

  for (const policy of devOnlyPolicies) {
    if (!containsPolicyDefinition(sql, policy.name)) {
      continue;
    }

    findings.push({
      file,
      policy: policy.name,
      reason: policy.reason,
      hasMarker: hasDevOnlyMarker(sql, policy.name)
    });
  }
}

const markerIssues = findings.filter((item) => !item.hasMarker);
if (markerIssues.length > 0) {
  console.error('❌ RLS check selhal: dev-only policy nemá povinný marker DEV_ONLY_POLICY.');
  for (const issue of markerIssues) {
    console.error(`- ${issue.policy} v ${issue.file}`);
  }
  process.exit(1);
}

if (mode === 'prod' && findings.length > 0) {
  console.error('❌ RLS check selhal: produkční release nesmí obsahovat dev-only policy.');
  for (const finding of findings) {
    console.error(`- ${finding.policy} v ${finding.file}: ${finding.reason}`);
  }
  process.exit(1);
}

if (findings.length === 0) {
  console.log('✅ RLS check: dev-only policy nebyly nalezeny.');
} else {
  console.log(`✅ RLS check (${mode}): nalezené dev-only policy jsou označené a režim je bezpečný.`);
  for (const finding of findings) {
    console.log(`- ${finding.policy} v ${finding.file}`);
  }
}
