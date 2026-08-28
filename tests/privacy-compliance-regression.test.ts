import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

test('veřejný occupancy view vrací jen údaje obsazenosti', () => {
  const sql = read('supabase/migrations/20260721133000_waiting_for_payment_occupancy.sql');
  const publicView = sql.match(/create or replace view public\.reservation_public_occupancy[\s\S]*?grant select on public\.reservation_public_occupancy to authenticated;/i)?.[0] ?? '';
  const selectProjection = publicView.match(/\bas\s+select([\s\S]*?)\bfrom\s+public\.reservations\s+r/i)?.[1] ?? '';

  assert.notEqual(selectProjection, '');
  assert.match(publicView, /court_id[\s\S]*reservation_date[\s\S]*time_from[\s\S]*time_to[\s\S]*status/i);
  for (const privateColumn of ['user_id', 'email', 'full_name', 'name', 'phone', 'note', 'access_token', 'refresh_token']) {
    assert.doesNotMatch(selectProjection, new RegExp(`\\b${privateColumn}\\b`, 'i'));
  }
});

test('auditní trigger nekopíruje poznámku ani celý reservation objekt', () => {
  const sql = read('supabase/migrations/20260826120000_minimize_reservation_audit_payload.sql');
  const triggerDefinitions = sql.split('-- Ze starších záznamů')[0];

  assert.doesNotMatch(triggerDefinitions, /new\.note|to_jsonb\s*\(\s*(?:new|old)\s*\)/i);
  assert.match(sql, /payload\s*-\s*'note'\s*-\s*'old'\s*-\s*'new'/i);
  assert.doesNotMatch(sql, /(?:delete\s+from|truncate)\s+public\.reservations/i);
  assert.doesNotMatch(sql, /update\s+public\.reservations/i);
});

test('minimalizovaný audit zachovává systémové auto approve a ruční změny', () => {
  const sql = read('supabase/migrations/20260826120000_minimize_reservation_audit_payload.sql');
  const updateTrigger = sql.match(/create or replace function public\.log_reservation_update_audit\(\)[\s\S]*?\$\$;/i)?.[0] ?? '';

  assert.match(updateTrigger, /current_setting\(\s*'app\.reservation_auto_approval'\s*,\s*true\s*\)\s*=\s*'true'/i);
  assert.match(updateTrigger, /if\s+v_is_auto_approval\s+then[\s\S]*v_action\s*:=\s*'auto_approve'[\s\S]*v_changed_by\s*:=\s*null/i);
  assert.match(updateTrigger, /elsif\s+new\.status\s*=\s*'cancelled'[\s\S]*v_action\s*:=\s*'cancel'[\s\S]*v_changed_by\s*:=\s*coalesce\(auth\.uid\(\),\s*new\.user_id\)/i);
  assert.match(updateTrigger, /else[\s\S]*v_action\s*:=\s*'update'[\s\S]*v_changed_by\s*:=\s*coalesce\(auth\.uid\(\),\s*new\.user_id\)/i);
  assert.doesNotMatch(updateTrigger, /new\.note|to_jsonb\s*\(\s*(?:new|old)\s*\)|'old'\s*,|'new'\s*,/i);
});

test('login informuje o zpracování e-mailu bez GDPR checkboxu', () => {
  const registrationSources = [
    read('app/prihlaseni/page.tsx'),
    read('supabase/templates/confirmation.html'),
    read('supabase/templates/magic_link.html'),
  ].join('\n');

  assert.match(registrationSources, /E-mail používáme pro přihlášení/i);
  assert.doesNotMatch(registrationSources, /type\s*=\s*["']checkbox["']|Souhlasím s GDPR/i);
});

test('neúplná privacy route vrací 404 a není veřejně odkazovaná', () => {
  const privacyPage = read('app/ochrana-osobnich-udaju/page.tsx');
  const publicLinkSources = [
    read('app/prihlaseni/page.tsx'),
    read('app/pravidla-rezervaci/page.tsx'),
    read('app/ucet/page.tsx'),
    read('components/footer.tsx'),
    read('supabase/templates/confirmation.html'),
    read('supabase/templates/magic_link.html'),
  ].join('\n');
  const sitemap = read('app/sitemap.ts');

  assert.match(privacyPage, /import\s*\{\s*notFound\s*\}\s*from\s*'next\/navigation'/);
  assert.match(privacyPage, /function\s+PrivacyPage\(\)\s*\{\s*notFound\(\);\s*return\s*\(/);
  assert.match(privacyPage, /Ochrana osobních údajů/);
  assert.doesNotMatch(publicLinkSources, /\/ochrana-osobnich-udaju/);
  assert.doesNotMatch(sitemap, /\/ochrana-osobnich-udaju/);
  assert.match(privacyPage, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
});

test('veřejné UI neobsahuje pracovní privacy placeholdery', () => {
  const publicUi = [
    read('app/ochrana-osobnich-udaju/page.tsx'),
    read('app/prihlaseni/page.tsx'),
    read('app/pravidla-rezervaci/page.tsx'),
    read('app/ucet/page.tsx'),
    read('components/footer.tsx'),
  ].join('\n');

  assert.doesNotMatch(publicUi, /\[DOPLNIT|musí provozovatel doplnit|DOPLNIT KONTAKT/i);
});

test('veřejné právní texty popisují aktuální stav bez implementační historie', () => {
  const publicLegalText = [
    read('app/ochrana-osobnich-udaju/page.tsx'),
    read('app/pravidla-rezervaci/page.tsx'),
  ].join('\n');

  assert.match(publicLegalText, /bezplatn/i);
  assert.match(publicLegalText, /historické údaje[\s\S]*statistické vyhodnocování/i);
  assert.doesNotMatch(publicLegalText, /d5cab67|20260826120000|aktualizováno|nově jsme|poslední aktualizac|migrac(?:e|i)|commit/i);
  assert.doesNotMatch(publicLegalText, /VYŽADUJE ROZHODNUTÍ PROVOZOVATELE|nelze z dostupného kódu|produkční aktivaci/i);
  assert.doesNotMatch(publicLegalText, /\b(?:19|20)\d{2}\b/);
});

test('pravidla rezervací popisují schvalování výhradně jako ruční proces správce', () => {
  const reservationRules = read('app/pravidla-rezervaci/page.tsx');

  assert.match(reservationRules, /Schválení provádí správce ručně/);
  assert.doesNotMatch(reservationRules, /automatick(?:é|y|ému|ého)\s+schvalování|automaticky\s+schvál/i);
});

test('veřejné UI neobsahuje cookie consent banner', () => {
  const publicUi = [
    read('app/layout.tsx'),
    read('components/footer.tsx'),
    read('app/ochrana-osobnich-udaju/page.tsx'),
  ].join('\n');

  assert.doesNotMatch(publicUi, /cookie\s*(?:consent|souhlas|banner|lišt)/i);
});
