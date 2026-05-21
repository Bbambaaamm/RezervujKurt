#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const mode = process.env.RLS_RELEASE_MODE === 'prod' ? 'prod' : 'dev';


const requiredPolicies = [
  {
    table: 'public.reservations',
    name: 'reservations_select_owner_or_admin',
    reason: 'Admin musí mít SELECT na reservations přes policy owner_or_admin i po db resetu.'
  },
  {
    table: 'public.reservations',
    name: 'reservations_select_public_occupancy_anon',
    reason: 'Anonymní occupancy read musí povolit pending/approved pro veřejný grid.'
  }
];

const devOnlyPolicies = [
];

const forbiddenPolicyFragments = [
  {
    needle: "coalesce(current_setting('app.rls_mode', true), 'prod') = 'dev'",
    reason: 'Legacy DEV podmínka na reservations select by zablokovala veřejný grid mimo app.rls_mode=dev.'
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

for (const policy of requiredPolicies) {
  const exists = files.some((file) => {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    return containsPolicyDefinition(sql, policy.name);
  });

  if (!exists) {
    console.error('❌ RLS check selhal: chybí povinná policy.');
    console.error(`- ${policy.name} (${policy.table}): ${policy.reason}`);
    process.exit(1);
  }
}

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


const legacyPolicyFindings = [];
for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  for (const rule of forbiddenPolicyFragments) {
    if (sql.includes(rule.needle)) {
      legacyPolicyFindings.push({ file, reason: rule.reason });
    }
  }
}

if (legacyPolicyFindings.length > 0) {
  console.warn('⚠️ RLS check upozornění: nalezena legacy DEV policy v historii migrací.');
  for (const finding of legacyPolicyFindings) {
    console.warn(`- ${finding.file}: ${finding.reason}`);
  }
  console.warn('  Ověřte, že je aplikovaná migrace 20260521110000_public_reservations_anon_pending_approved.sql.');
}
