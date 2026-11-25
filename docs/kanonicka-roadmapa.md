# RezervujKurt — kanonická roadmapa po systémovém auditu

**Stav:** aktivní zdroj pravdy pro pořadí práce  
**Datum revize:** 2026-11-25  
**Výchozí commit:** `d484513dadf2fe533be074c17d1742c95f0258cd`  
**Pravidlo:** core rezervace a payment/GoPay se nesmí nasazovat v jednom release kroku.

## 0. Povinné release invarianty

1. Production databáze se nesmí měnit plošným `supabase db push`, dokud jsou v repo migration streamu payment migrace, které production záměrně nemá.
2. Každý production DB release používá explicitní allowlist konkrétních migrací.
3. Core security release nesmí vytvářet, měnit ani odkazovat na `payments`, `payment_*`, `gopay` ani stav `waiting_for_payment`.
4. Payment release nesmí být vedlejším efektem core PR.
5. Před každým production DB releasem se porovná GitHub migration stream, staging history a production history.
6. Každý release musí mít preflight, staging evidence, rollback podmínky a post-deploy audit.
7. Production a staging nesmí sdílet databázi, auth uživatele ani secrets.

## Fáze 0 — Quarantine Payments [P0]

Cíl: zaručit, že současná produkce může dostávat core změny bez rizika aktivace nebo vytvoření platebních objektů.

- [ ] Inventarizovat všechny payment/GoPay soubory v `main`.
- [ ] Oddělit payment databázové migrace od běžného production migration streamu nebo zavést release mechanismus, který je nikdy neaplikuje mimo explicitní payment release.
- [ ] Odstranit payment části z core migrací `20261005203500_security_definer_hardening.sql` a `20261005211500_security_warning_cleanup.sql`.
- [ ] Core migrace nesmí obsahovat ani `waiting_for_payment`.
- [ ] Přidat CI guard: core release migrace nesmí obsahovat `payment`, `payments`, `gopay`, `waiting_for_payment`.
- [ ] Přidat CI guard: production release nesmí použít neomezený `supabase db push`.
- [ ] Rozhodnout, zda payment API/serverový kód zůstane v `main` fail-closed, nebo se dočasně oddělí do payment integrační větve.
- [ ] Fresh replay core-only release na prázdné databázi.

**Exit gate:** je technicky nemožné nasadit payment schéma nebo payment runtime jako vedlejší efekt core releasu.

## Fáze 1 — Core Security Release B [P0]

- [ ] Připravit čisté core-only security migrace.
- [ ] Ověřit RLS a grants na stagingu.
- [ ] Ověřit reservation lifecycle: create → pending → approve/cancel → audit → outbox.
- [ ] Ověřit veřejnou occupancy a member/admin notes.
- [ ] Security Advisor: odstranit core `security_definer_view`, veřejně executable SECURITY DEFINER RPC a core `auth_rls_initplan`.
- [ ] Ověřit migration history staging/GitHub 1:1.
- [ ] Production preflight.
- [ ] Explicitně nasadit pouze allowlisted core migrace.
- [ ] Production post-deploy audit.

**Exit gate:** production core je hardenovaný a žádný payment objekt nebyl vytvořen ani změněn.

## Fáze 2 — Stabilní staging [P0]

- [ ] Zřídit permanentní Vercel staging projekt/URL.
- [ ] Napojit pouze na staging Supabase `rrlvlgoiwesteevzupyi`.
- [ ] Nastavit staging Auth redirect allowlist.
- [ ] Ověřit oddělení secrets a env.
- [ ] Ověřit magic-link lifecycle.
- [ ] Doplnit custom SMTP nebo výslovně evidovat jeho odklad a provozní limit.

**Exit gate:** existuje stabilní HTTPS staging prostředí vhodné pro externí callbacky a E2E.

## Fáze 3 — Payment DB foundation [P1]

Až po dokončení Fází 0–2.

- [ ] Payment schéma nasadit pouze do stagingu.
- [ ] Ověřit `payments`, audit, pricing, feature flags, idempotency a expiration.
- [ ] Ověřit service-role-only RPC kontrakty.
- [ ] Ověřit RLS/grants a nemožnost klientských zápisů.
- [ ] Definovat rollback a retention pravidla.

## Fáze 4 — Kanonický payment state machine [P1]

Interní stavy musí mít jedinou definici a jedinou mapu vůči GoPay stavům.

Minimální interní stavy:
`created`, `awaiting_payment`, `paid`, `failed`, `cancelled`, `expired`, `requires_manual_review`.

- [ ] Dokumentovat povolené přechody.
- [ ] Dokumentovat mapování GoPay → interní stav.
- [ ] Zakázat paralelní implementace mapování v různých vrstvách.
- [ ] Testovat duplicate/out-of-order events.

## Fáze 5 — GoPay create [P1]

- [ ] Atomické vytvoření reservation + local payment.
- [ ] Idempotency.
- [ ] Server-side výpočet ceny.
- [ ] GoPay create request.
- [ ] Validace provider response.
- [ ] Uložení provider ID a gateway URL.
- [ ] `waiting_for_payment` blokuje slot.

## Fáze 6 — Notification + authoritative inquiry [P1]

- [ ] Stabilní HTTPS notification URL na stagingu.
- [ ] Notification nikdy není sama o sobě zdroj pravdy.
- [ ] Po notification/return provést payment inquiry u GoPay.
- [ ] Ověřit payment identity, amount, currency a stav.
- [ ] Idempotentní zpracování duplicate notification.
- [ ] Odolnost vůči pořadí redirect vs notification.

## Fáze 7 — Reconciliation [P1]

- [ ] Periodický scan unresolved payments.
- [ ] Inquiry u GoPay.
- [ ] Oprava lokálního stavu s auditní stopou.
- [ ] Alert na mismatch a dlouho visící `awaiting_payment`.

## Fáze 8 — Payment UI [P2]

Až po stabilním backend lifecycle.

- [ ] Cena a checkout.
- [ ] Stav čekání.
- [ ] Úspěch/neúspěch/timeout.
- [ ] Moje platby.
- [ ] Admin přehled.

## Fáze 9 — Refunds [P2]

- [ ] Explicitní refund state machine.
- [ ] Full/partial refund.
- [ ] Idempotency.
- [ ] Audit.
- [ ] Manual review.
- [ ] Vazba na stav rezervace.

## Fáze 10 — Sandbox E2E [P0 pro payment release]

Povinné scénáře:
- success;
- decline/failure;
- timeout;
- zavření gateway;
- pozdní výsledek;
- duplicate notification;
- notification před redirectem;
- redirect před notification;
- opakovaný create request;
- síťová chyba;
- stejný idempotency key;
- dva uživatelé stejný slot;
- expiration;
- refund;
- reconciliation.

## Fáze 11 — Observability [P0 pro payment release]

Metriky:
- created/paid/failed/expired;
- stáří `awaiting_payment`;
- manual review;
- GoPay latency/error rate;
- reconciliation mismatch;
- refund failures.

## Fáze 12 — Retention a provoz [P1]

- [ ] Definovat retention payment a audit dat.
- [ ] Incident runbook.
- [ ] Recovery/reconciliation postup.
- [ ] Odpovědnosti a přístupy.
- [ ] Účetní a zákaznická evidence potřebná i po nedostupnosti provider API historie.

## Fáze 13 — Production dark launch [P0]

- [ ] Payment migrace explicitně allowlisted.
- [ ] Production secrets.
- [ ] Všechny payment feature flags OFF.
- [ ] Connectivity/inquiry test bez aktivace veřejného checkoutu.
- [ ] Jedna řízená interní platba.
- [ ] Post-deploy audit.

## Fáze 14 — Postupné enable [P0]

Zapínat schopnosti jednotlivě:
1. create;
2. notification/inquiry;
3. expiration;
4. monitoring;
5. refunds až později.

Každý krok má vlastní rollback trigger.

## Povinné pořadí práce

```
0 Quarantine Payments
→ 1 Core Security Release B
→ 2 Stabilní staging
→ 3 Payment DB foundation
→ 4 State machine
→ 5 GoPay create
→ 6 Notification + inquiry
→ 7 Reconciliation
→ 8 UI
→ 9 Refunds
→ 10 Sandbox E2E
→ 11 Observability
→ 12 Retention/Operations
→ 13 Production dark launch
→ 14 Postupné enable
```

## Zakázané zkratky

- žádný production `db push` bez explicitního ověření pending migrací;
- žádné payment migrace v core security releasu;
- žádná aktivace payment feature flagu před dokončením sandbox E2E;
- žádné spoléhání na browser redirect jako potvrzení platby;
- žádné spoléhání pouze na provider notification bez následného authoritative inquiry;
- žádné production payment enable bez observability a reconciliation.

## Aktuální nejbližší úkol

**Fáze 0 — Quarantine Payments.** Dokud není hotová, další production DB release je blokovaný.
