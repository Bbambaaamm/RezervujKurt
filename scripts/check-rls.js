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
  }
];


const requiredPublicOccupancyArtifacts = [
  {
    type: 'view',
    name: 'public.reservation_public_occupancy',
    matcher: /create\s+or\s+replace\s+view\s+public\.reservation_public_occupancy/i,
    reason: 'Veřejný grid musí mít minimální read-only pohled na obsazenost.'
  },
  {
    type: 'grant',
    name: 'grant_select_reservation_public_occupancy_anon',
    matcher: /grant\s+select\s+on\s+public\.reservation_public_occupancy\s+to\s+anon/i,
    reason: 'Anonymní návštěvník musí číst veřejnou obsazenost.'
  },
  {
    type: 'grant',
    name: 'grant_select_reservation_public_occupancy_authenticated',
    matcher: /grant\s+select\s+on\s+public\.reservation_public_occupancy\s+to\s+authenticated/i,
    reason: 'Přihlášený uživatel musí číst stejnou veřejnou obsazenost.'
  }
];

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

for (const artifact of requiredPublicOccupancyArtifacts) {
  const exists = files.some((file) => {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    return artifact.matcher.test(sql);
  });

  if (!exists) {
    console.error('❌ RLS check selhal: chybí povinný public occupancy artefakt.');
    console.error(`- ${artifact.name}: ${artifact.reason}`);
    process.exit(1);
  }
}

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
