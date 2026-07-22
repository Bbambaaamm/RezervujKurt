# Staging runbook: doplňkové ověření RPC `record_payment_state_change`

Tento runbook navazuje na částečné staging ověření z `docs/gopay-faze-3-runbook.md`. Jeho cílem je samostatně uzavřít scénáře, které nebyly 22. 7. 2026 označené jako runtime `PASS`: no-op přechod, neexistující `payment_id`, zákaz spuštění klientskými rolemi a odmítnutí nesouvisejících parametrů při přechodu do `paid`.

## Bezpečnostní pravidla

- Spouštět pouze na staging Supabase projektu `rrlvlgoiwesteevzupyi`.
- Nepoužívat produkční URL, produkční anon key ani produkční service-role key.
- GoPay capability i dynamické platební flagy musí zůstat vypnuté.
- Testovací data musí používat pevně rozpoznatelné UUID a po ověření musí být odstraněná.
- Role `anon` a `authenticated` se ověřují přes SQL simulaci rolí nebo přes staging REST/RPC endpoint s odpovídajícím tokenem; očekávaný výsledek je odmítnutí oprávněním.

## Příprava testovacích dat

Spusť jako databázový vlastník nebo service role na stagingu:

```sql
begin;

insert into public.reservations (
  id,
  user_id,
  court_id,
  reservation_date,
  time_from,
  time_to,
  status,
  note
)
values (
  '00000000-0000-4000-9100-000000000001',
  'b799f67e-d203-43ef-b0b2-699c2fbd2a33',
  1,
  '2099-12-30',
  '21:00',
  '22:00',
  'waiting_for_payment',
  'STAGING TEST – record_payment_state_change doplněk'
)
on conflict (id) do nothing;

insert into public.payments (
  id,
  reservation_id,
  provider_payment_id,
  idempotency_key,
  amount_cents,
  currency,
  status,
  expires_at,
  attempt_count
)
values (
  '00000000-0000-4000-9100-000000000011',
  '00000000-0000-4000-9100-000000000001',
  'STAGING-RPC-PAID-001',
  'staging-rpc-paid-001',
  25000,
  'CZK',
  'awaiting_payment',
  now() + interval '15 minutes',
  1
)
on conflict (id) do nothing;

commit;
```

## Scénáře k ověření

### 1. No-op přechod je odmítnutý

```sql
select public.record_payment_state_change(
  '00000000-0000-4000-9100-000000000011',
  'awaiting_payment',
  'app_server',
  'staging no-op kontrola',
  '{"test":"rpc-no-op"}'::jsonb
);
```

Očekávání: volání skončí chybou typu `Platba ... už je ve stavu awaiting_payment`. Stav platby ani auditní log se nezmění.

### 2. Neexistující `payment_id` je odmítnutý

```sql
select public.record_payment_state_change(
  '00000000-0000-4000-9100-000000009999',
  'paid',
  'app_server',
  'staging missing payment kontrola',
  '{"test":"rpc-missing-payment"}'::jsonb,
  null,
  null,
  now()
);
```

Očekávání: volání skončí chybou `Platba ... neexistuje` a nevznikne žádný auditní záznam.

### 3. Klientská role `authenticated` nesmí RPC spustit

```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'b799f67e-d203-43ef-b0b2-699c2fbd2a33';

select public.record_payment_state_change(
  '00000000-0000-4000-9100-000000000011',
  'paid',
  'app_server',
  'staging authenticated grant kontrola',
  '{"test":"rpc-authenticated-denied"}'::jsonb,
  null,
  null,
  now()
);

rollback;
```

Očekávání: volání skončí chybou oprávnění pro funkci `record_payment_state_change`; řádek v `payments` zůstane beze změny.

### 4. Klientská role `anon` nesmí RPC spustit

```sql
begin;
set local role anon;

select public.record_payment_state_change(
  '00000000-0000-4000-9100-000000000011',
  'paid',
  'app_server',
  'staging anon grant kontrola',
  '{"test":"rpc-anon-denied"}'::jsonb,
  null,
  null,
  now()
);

rollback;
```

Očekávání: volání skončí chybou oprávnění pro funkci `record_payment_state_change`; řádek v `payments` zůstane beze změny.

### 5. Přechod `awaiting_payment → paid` odmítne nepovolený `failed_at`

```sql
select public.record_payment_state_change(
  '00000000-0000-4000-9100-000000000011',
  'paid',
  'app_server',
  'staging paid failed_at kontrola',
  '{"test":"rpc-paid-rejects-failed-at"}'::jsonb,
  null,
  null,
  now(),
  now()
);
```

Očekávání: volání skončí chybou `Přechod na paid povoluje pouze paid_at`. Stav platby ani auditní log se nezmění.

### 6. Pozitivní kontrola po odmítnutých scénářích

Po odmítnutých scénářích ověř, že lze stejný testovací payment stále korektně převést do `paid` jen s povoleným parametrem `paid_at`:

```sql
select public.record_payment_state_change(
  '00000000-0000-4000-9100-000000000011',
  'paid',
  'app_server',
  'staging paid pozitivní kontrola',
  '{"test":"rpc-paid-positive"}'::jsonb,
  null,
  null,
  now()
);
```

Očekávání: volání vrátí ID platby, `payments.status = 'paid'`, `paid_at is not null` a vznikne právě jeden auditní záznam `payment_verified` pro pozitivní přechod.

## Cleanup

```sql
begin;

delete from public.payment_audit_log
where payment_id = '00000000-0000-4000-9100-000000000011';

delete from public.payments
where id = '00000000-0000-4000-9100-000000000011';

delete from public.reservations
where id = '00000000-0000-4000-9100-000000000001'
  and note = 'STAGING TEST – record_payment_state_change doplněk';

commit;

select
  (select count(*) from public.payments where id = '00000000-0000-4000-9100-000000000011') as remaining_payments,
  (select count(*) from public.reservations where id = '00000000-0000-4000-9100-000000000001') as remaining_reservations,
  (select count(*) from public.payment_audit_log where payment_id = '00000000-0000-4000-9100-000000000011') as remaining_audit_rows;
```

Očekávání: všechny tři hodnoty jsou `0`.

## Evidence výsledku

Po reálném staging průchodu doplň do `docs/gopay-faze-3-runbook.md` datum, kdo ověřil a výsledek pro každý scénář. Dokud průchod neproběhne na staging databázi, nesmí být tyto scénáře označené jako runtime `PASS`.
