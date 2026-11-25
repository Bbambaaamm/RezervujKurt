# Systémový audit RezervujKurt — 2026-11-25

**Auditovaný stav GitHub main:** `d484513dadf2fe533be074c17d1742c95f0258cd`  
**Rozsah:** Git/release governance, migrace, Supabase production/staging, RLS, Auth, Storage, Edge Functions, notification outbox, payment izolace, CI, runtime logy.  
**Vercel:** živý account audit je částečně blokovaný chybějící aktuální autorizací team scope; veřejný HTTP probe přes dostupný web nástroj nebyl dostupný.

## Executive summary

Celkový stav: **YELLOW / řízeně provozuschopné core, release governance vyžaduje opravu před dalším production DB releasem.**

Nejdůležitější skutečnost: production databáze je stále core-only, staging obsahuje payment schéma. Repo však obsahuje payment migrace ve stejném chronologickém migration streamu jako core. Proto standardní neomezený remote `supabase db push` není bezpečný pro core production release.

## P0 — blokery

### P0.1 Payment migrace jsou v hlavním migration streamu

Repo obsahuje 40 SQL migrací. Payment blok začíná:
- `20260721120000_create_payments_foundation.sql`
- `20260721133000_waiting_for_payment_occupancy.sql`
- `20260721150000_payment_feature_flags.sql`
- další payment migrace až do `20260728160000_bind_payment_attempt_snapshot.sql`.

Production migration history tyto migrace nemá. Staging je má.

**Riziko:** běžný remote `db push` porovnává lokální soubory s `supabase_migrations.schema_migrations` a aplikuje pending migrace v pořadí. Core release by tedy mohl nechtěně nasadit payment schéma.

**Akce:** Fáze 0 kanonické roadmapy — quarantine payments + explicitní release allowlist.

### P0.2 Core security migrace stále obsahuje payment capability

`20261005203500_security_definer_hardening.sql` obsahuje payment helper/view blok a `waiting_for_payment` v reservation helperu.

`20261005211500_security_warning_cleanup.sql` vytváří `public.set_payments_updated_at()`.

**Riziko:** core release není skutečně payment-free a cleanup může kolidovat s budoucí payment foundation migrací.

**Akce:** vytvořit čisté core-only náhrady / následné migrační řešení bez payment referencí.

### P0.3 RLS statický guard je ve sporu s cílovým hardeningem

`scripts/check-rls.js` stále požaduje veřejný occupancy view s:
`security_invoker = false, security_barrier = true`.

Staging po hardeningu správně používá `security_invoker=true`.

**Riziko:** CI může chránit zastaralý bezpečnostní kontrakt a brzdit/zkreslovat budoucí opravy.

**Akce:** aktualizovat guard na nový canonical security model.

## P1 — vysoká priorita

### P1.1 Production security hardening není ještě aplikovaný

Production:
- `reservation_public_occupancy`: `security_invoker=false`
- `reservation_member_occupancy_notes`: `security_invoker=false`
- `public.is_admin()` stále existuje
- několik trigger SECURITY DEFINER funkcí má default ACL / jsou podle Security Advisoru veřejně volatelné
- Performance Advisor hlásí 7× `auth_rls_initplan`.

Staging:
- reservation/payment views mají `security_invoker=true`
- `is_admin` je v `private`
- veřejné trigger helpery mají EXECUTE omezený
- core `auth_rls_initplan` hardening je ověřen.

**Akce:** po dokončení Fáze 0 nasadit čistý Core Security Release B explicitním allowlistem.

### P1.2 Stálý Vercel staging není živě potvrzený

Supabase staging existuje a je zdravý, ale repository dokumentace stále vede permanentní Vercel staging jako nedokončený. Živý Vercel account audit byl dnes blokovaný ztracenou team-scope autorizací konektoru.

**Akce:** obnovit Vercel team autorizaci, potvrdit/ vytvořit permanentní staging projekt a jeho HTTPS URL před GoPay callback E2E.

### P1.3 Dependency drift

`package.json`:
- `next: 16.2.9`
- `eslint-config-next: 15.3.2`
- Node engine `22.x`.

**Riziko:** major mismatch Next vs eslint-config-next; build může procházet, ale lint pravidla a framework compatibility nejsou ve stejné major řadě.

**Akce:** samostatný dependency alignment PR, bez míchání s DB release.

### P1.4 Production Auth hardening není kompletní

Security Advisor production i staging:
- leaked password protection disabled.

Production Auth:
- 46 uživatelů
- 43 potvrzených
- 0 aktuálně banned.

Repo dokumentace dále uvádí custom SMTP jako nedokončenou podmínku širšího veřejného provozu.

**Akce:** rozhodnout plan/capability pro leaked-password protection; ověřit OTP expiry, email confirmation a custom SMTP proti aktuálnímu production checklistu.

## P2 — střední priorita

### P2.1 Performance Advisor

Production:
- 3 unindexed foreign keys
- 1 unused index
- 4 multiple permissive policy warnings
- 7 auth RLS initplan warnings (část řeší Release B).

Staging:
- 4 unindexed foreign keys
- 3 unused indexes
- 4 multiple permissive policies.

**Akce:** nejdřív Release B, potom re-run advisor a řešit pouze zbylé nálezy podle reálných query patterns.

### P2.2 Extension placement

Production:
- `btree_gist` v `public`, relocatable=true
- `pg_net` v `public`, relocatable=false.

Staging:
- `btree_gist` v `extensions`.

**Akce:** přesun `btree_gist` zahrnout pouze do čistého core security release, bez vytváření payment helperů. `pg_net` neřešit destruktivně bez samostatného plánu.

### P2.3 Storage

Obě prostředí:
- bucket `tournament-posters` je veřejný
- veřejný SELECT je záměrný
- INSERT je admin-only.

Production admin storage policy stále používá `is_admin()` z public; staging už `private.is_admin()`.

**Akce:** zahrnuto do Core Security Release B.

## Silné stránky / PASS

- Production a staging Supabase jsou `ACTIVE_HEALTHY`.
- Production je stále core-only: žádné payment tabulky ani `waiting_for_payment`.
- RLS je zapnuté na všech hlavních production public tabulkách.
- Reservation audit privacy je čistá:
  - production 840 řádků, 0× `note`, 0× `old`, 0× `new`
  - staging 39 řádků, 0× stejné citlivé snapshoty.
- Production notification outbox: 745× `sent`, žádné pending/failed/processing.
- Production Edge Function `process-notification-outbox`: ACTIVE, verify_jwt=true.
- Staging Edge Function má stejný deployed hash jako production.
- CI obsahuje explicitní guard proti automatickému remote `supabase db push` a `supabase link`.
- GitHub momentálně nemá otevřené issues ani PR.
- Payment server route je fail-closed a aktivace je navržena přes feature flags.

## Staging zvláštní provozní stav

Staging notification outbox:
- 29× `pending`
- 1× `sent`.

Tyto události mohou patřit k historickým/testovacím datům. Worker se nesmí spustit naslepo, protože by mohl odeslat skutečné e-maily.

## Runtime log audit — posledních 24 h

Production:
- Edge/API requesty pozorované v gateway logu: 1460× HTTP 200.
- PostgREST log obsahuje četné `Warp server error: Thread killed by timeout manager`.
- Tento text je známý PostgREST/Warp logovací jev, který může vznikat i při normálním ukončování vláken; samostatně není důkazem 5xx incidentu.
- PostgreSQL/Edge Function logy v kontrolovaném okně nevykazovaly error-like události.

**Akce:** monitorovat service health a skutečné HTTP 5xx, ne alarmovat pouze podle textu Warp logu.

## Git/release governance

Aktuální Build Gate kontroluje:
- zákaz automatického remote DB push/link
- Node 22
- lint
- unit testy
- RLS guard
- build.

Chybí:
1. core-release payment quarantine guard;
2. migration allowlist/dry-run artifact pro production release;
3. kontrola, že core release migrace neobsahují `payment|gopay|waiting_for_payment`;
4. fresh replay core-only migration setu;
5. aktuální guard pro `security_invoker=true`.

## Doporučené bezprostřední pořadí

1. **P0: Quarantine Payments**
2. Aktualizovat CI guardy
3. Fresh replay core-only
4. Staging regression
5. Production preflight
6. Core Security Release B
7. Post-deploy audit
8. Obnovit/ověřit permanentní Vercel staging
9. Dependency alignment
10. Teprve potom pokračovat payment roadmapou.

## Release decision

**Další production DB release: NO-GO**, dokud není dokončena Fáze 0.

**Současný production core provoz:** pokračovat lze; nebyl nalezen důkaz aktivního payment schématu ani rozbitého notification workeru.

## Audit limitations

- Vercel team API audit dnes blokuje chybějící aktuální team-scope autorizace konektoru.
- Některá Auth/organization nastavení (SSL/network restrictions, OTP expiry, SMTP config, org MFA/owners) nejsou dostupná přes současné Supabase MCP akce a jsou označena k samostatnému Management API/Dashboard auditu.
