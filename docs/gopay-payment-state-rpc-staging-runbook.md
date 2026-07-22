# Staging runbook: doplňkové ověření RPC `record_payment_state_change`

Tento runbook navazuje na částečné staging ověření z `docs/gopay-faze-3-runbook.md`. Jeho cílem je samostatně uzavřít scénáře, které nebyly 22. 7. 2026 označené jako runtime `PASS`: no-op přechod, neexistující `payment_id`, zákaz spuštění klientskými rolemi a odmítnutí nesouvisejících parametrů při přechodu do `paid`.

## Bezpečnostní pravidla

- Spouštět pouze na staging Supabase projektu `rrlvlgoiwesteevzupyi`.
- Nepoužívat produkční URL, produkční anon key ani produkční service-role key.
- GoPay capability i dynamické platební flagy musí zůstat vypnuté.
- Každý chybový scénář spouštěj samostatně, nikoliv celý dokument jako jeden SQL skript. Po očekávané chybě spusť kontrolní `SELECT` zvlášť jako databázový vlastník nebo service role.
- Pokud očekávané chybové RPC volání běží uvnitř transakce se změněnou rolí, spusť `BEGIN` a `SET LOCAL` samostatně, potom samostatně RPC volání, očekávej chybu, potom samostatně `ROLLBACK`. Některá SQL rozhraní po očekávané chybě nepokračují automaticky na další příkaz v dávce.
- Test je možné označit jako `PASS` jen tehdy, pokud chybový scénář skončí očekávaným typem chyby a následné kontrolní dotazy potvrdí nezměněný stav platby i auditu.

## Testovací hodnoty

Před spuštěním nahraď placeholdery skutečnými staging hodnotami:

| Placeholder | Význam | Doporučení |
|---|---|---|
| `<TEST_USER_ID>` | ID bezpečně identifikovaného staging testovacího uživatele | Použij běžný neadmin testovací profil, který smí vlastnit testovací rezervaci. |
| `<TEST_COURT_ID>` | ID existujícího aktivního staging kurtu | Vyber z dotazu nad `public.courts`; nepředpokládej konkrétní ID. |

Pevné testovací identifikátory níže ponech jen v případě, že preflight potvrdí jejich neexistenci:

- `reservation_id`: `00000000-0000-4000-9100-000000000001`
- `payment_id`: `00000000-0000-4000-9100-000000000011`
- `missing_payment_id`: `00000000-0000-4000-9100-000000009999`
- `provider_payment_id`: `STAGING-RPC-PAID-001`
- `idempotency_key`: `staging-rpc-paid-001`
- testovací slot: `2099-12-30`, `<TEST_COURT_ID>`, `21:00` až `22:00`

## Preflight kontroly

### Ověření testovacího uživatele

```sql
select id, role
from public.profiles
where id = '<TEST_USER_ID>'::uuid;
```

Očekávání: právě jeden bezpečně identifikovaný staging testovací uživatel. Pokud dotaz nevrátí žádný řádek nebo vrátí neočekávanou roli, test nespouštěj a nejdřív vyber správný staging účet.

### Ověření aktivního kurtu

```sql
select id, name, is_active
from public.courts
where id = <TEST_COURT_ID>;
```

Očekávání: právě jeden existující aktivní kurt (`is_active = true`). Runbook nesmí předpokládat pevné `court_id`.

### Ověření volného slotu

```sql
select id, court_id, reservation_date, time_from, time_to, status
from public.reservations
where court_id = <TEST_COURT_ID>
  and reservation_date = date '2099-12-30'
  and status in ('pending', 'approved', 'waiting_for_payment')
  and time_from < time '22:00'
  and time_to > time '21:00';
```

Očekávání: nula řádků. Pokud existuje překryv, zvol jiný testovací slot nebo jiné UUID a pokračuj až po nové kontrole.

### Ověření neexistence testovacích identifikátorů

```sql
do $$
begin
  if exists (
    select 1
    from public.reservations
    where id = '00000000-0000-4000-9100-000000000001'
  ) then
    raise exception 'Testovací reservation_id již existuje. Cleanup nebo nová UUID jsou nutné.';
  end if;

  if exists (
    select 1
    from public.payments
    where id = '00000000-0000-4000-9100-000000000011'
       or provider_payment_id = 'STAGING-RPC-PAID-001'
       or idempotency_key = 'staging-rpc-paid-001'
  ) then
    raise exception 'Testovací payment identifikátor již existuje. Cleanup nebo nové hodnoty jsou nutné.';
  end if;

  if exists (
    select 1
    from public.payment_audit_log
    where payment_id = '00000000-0000-4000-9100-000000000011'
  ) then
    raise exception 'Audit pro testovací payment_id již existuje. Cleanup nebo nová UUID jsou nutné.';
  end if;
end
$$;
```

Očekávání: blok doběhne bez chyby. Nepoužívej `ON CONFLICT DO NOTHING`, protože by tiše navázal test na cizí historická data.

### Ověření grantů před runtime testem

Signatura musí odpovídat aktuální funkci z migrace `20260722100000_service_role_payment_state_rpc.sql`.

```sql
select
  has_function_privilege(
    'authenticated',
    'public.record_payment_state_change(uuid,text,text,text,jsonb,text,timestamptz,timestamptz,timestamptz,timestamptz,text,boolean)',
    'EXECUTE'
  ) as authenticated_can_execute,
  has_function_privilege(
    'anon',
    'public.record_payment_state_change(uuid,text,text,text,jsonb,text,timestamptz,timestamptz,timestamptz,timestamptz,text,boolean)',
    'EXECUTE'
  ) as anon_can_execute;
```

Očekávání: `authenticated_can_execute = false` a `anon_can_execute = false`.

## Příprava testovacích dat

Spusť jako databázový vlastník nebo service role na stagingu až po úspěšném preflightu:

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
  '<TEST_USER_ID>'::uuid,
  <TEST_COURT_ID>,
  '2099-12-30',
  '21:00',
  '22:00',
  'waiting_for_payment',
  'STAGING TEST – record_payment_state_change doplněk'
);

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
);

commit;
```

## Výchozí snapshot platby a auditu

Tento snapshot si ulož do evidence staging ověření. Stejné kontroly spouštěj po každém odmítnutém scénáři.

```sql
select
  id,
  reservation_id,
  status,
  provider_payment_id,
  paid_at,
  failed_at,
  cancelled_at,
  expires_at,
  attempt_count,
  last_error
from public.payments
where id = '00000000-0000-4000-9100-000000000011';

select count(*) as audit_count
from public.payment_audit_log
where payment_id = '00000000-0000-4000-9100-000000000011';
```

Očekávání: platba je ve stavu `awaiting_payment`, má `provider_payment_id = 'STAGING-RPC-PAID-001'`, `attempt_count = 1`, `paid_at`, `failed_at`, `cancelled_at` a `last_error` jsou `null`; `audit_count = 0`.

## Kontrola po odmítnutém scénáři

Po každé očekávané chybě spusť jako databázový vlastník nebo service role:

```sql
select
  id,
  reservation_id,
  status,
  provider_payment_id,
  paid_at,
  failed_at,
  cancelled_at,
  expires_at,
  attempt_count,
  last_error
from public.payments
where id = '00000000-0000-4000-9100-000000000011';

select count(*) as audit_count
from public.payment_audit_log
where payment_id = '00000000-0000-4000-9100-000000000011';
```

Očekávání: výsledek je shodný s výchozím snapshotem a `audit_count = 0`. Pokud se změnil stav platby nebo vznikl auditní řádek, scénář není `PASS`.

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

Očekávání: volání skončí chybou typu `Platba ... už je ve stavu awaiting_payment`. Potom spusť kontrolu po odmítnutém scénáři.

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

Očekávání: volání skončí chybou `Platba ... neexistuje`. Potom spusť kontrolu po odmítnutém scénáři nad existující testovací platbou `00000000-0000-4000-9100-000000000011`.

### 3. Klientská role `authenticated` nesmí RPC spustit

Spusť `BEGIN` a změnu role samostatně:

```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub = '<TEST_USER_ID>';
```

Potom samostatně spusť RPC:

```sql
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
```

Očekávání: volání skončí chybou odpovídající `permission denied for function record_payment_state_change`. Scénář nesmí být označený jako `PASS`, pokud vznikne jiná chyba, například špatná signatura funkce, neexistující funkce, neexistující platba nebo nepovolený stavový přechod.

Potom samostatně ukonči transakci:

```sql
rollback;
```

Nakonec jako databázový vlastník nebo service role spusť kontrolu po odmítnutém scénáři.

### 4. Klientská role `anon` nesmí RPC spustit

Spusť `BEGIN` a změnu role samostatně:

```sql
begin;
set local role anon;
```

Potom samostatně spusť RPC:

```sql
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
```

Očekávání: volání skončí chybou odpovídající `permission denied for function record_payment_state_change`. Scénář nesmí být označený jako `PASS`, pokud vznikne jiná chyba, například špatná signatura funkce, neexistující funkce, neexistující platba nebo nepovolený stavový přechod.

Potom samostatně ukonči transakci:

```sql
rollback;
```

Nakonec jako databázový vlastník nebo service role spusť kontrolu po odmítnutém scénáři.

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

Očekávání: volání skončí chybou `Přechod na paid povoluje pouze paid_at`. Potom spusť kontrolu po odmítnutém scénáři.

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

Očekávání: volání vrátí ID platby `00000000-0000-4000-9100-000000000011`.

Potom ověř konkrétní stav platby a auditu. Sloupce v auditním dotazu odpovídají aktuální tabulce `payment_audit_log` z migračního schématu; tabulka nemá sloupec `actor`.

```sql
select
  id,
  reservation_id,
  status,
  provider_payment_id,
  paid_at,
  failed_at,
  cancelled_at,
  expires_at,
  attempt_count,
  last_error
from public.payments
where id = '00000000-0000-4000-9100-000000000011';

select
  id,
  payment_id,
  reservation_id,
  event_type,
  old_status,
  new_status,
  old_refund_status,
  new_refund_status,
  reason,
  source,
  attempt_count,
  metadata,
  created_at
from public.payment_audit_log
where payment_id = '00000000-0000-4000-9100-000000000011'
order by id;
```

Očekávání: platba má `status = 'paid'`, `paid_at is not null`, `failed_at is null`, `cancelled_at is null`, `attempt_count = 1` a `last_error is null`. Audit obsahuje právě jeden řádek s `event_type = 'payment_verified'`, `old_status = 'awaiting_payment'`, `new_status = 'paid'`, `source = 'app_server'`, `reason = 'staging paid pozitivní kontrola'` a `metadata->>'test' = 'rpc-paid-positive'`.

## Cleanup

Před mazáním nejdřív vypiš audit a potvrď, že obsahuje pouze očekávané testovací řádky vytvořené tímto runbookem:

```sql
select
  id,
  payment_id,
  reservation_id,
  event_type,
  old_status,
  new_status,
  old_refund_status,
  new_refund_status,
  reason,
  source,
  attempt_count,
  metadata,
  created_at
from public.payment_audit_log
where payment_id = '00000000-0000-4000-9100-000000000011'
order by id;
```

Očekávání po pozitivním testu: právě jeden řádek vytvořený tímto runbookem, přechod `awaiting_payment → paid`, `event_type = 'payment_verified'` a `metadata->>'test' = 'rpc-paid-positive'`.

Cleanup spusť jako databázový vlastník nebo service role:

```sql
begin;

with deleted_audit as (
  delete from public.payment_audit_log
  where payment_id = '00000000-0000-4000-9100-000000000011'
    and reservation_id = '00000000-0000-4000-9100-000000000001'
    and source = 'app_server'
    and metadata->>'test' in ('rpc-paid-positive')
  returning id
),
deleted_payment as (
  delete from public.payments
  where id = '00000000-0000-4000-9100-000000000011'
    and reservation_id = '00000000-0000-4000-9100-000000000001'
    and provider_payment_id = 'STAGING-RPC-PAID-001'
    and idempotency_key = 'staging-rpc-paid-001'
  returning id
),
deleted_reservation as (
  delete from public.reservations
  where id = '00000000-0000-4000-9100-000000000001'
    and user_id = '<TEST_USER_ID>'::uuid
    and court_id = <TEST_COURT_ID>
    and reservation_date = date '2099-12-30'
    and time_from = time '21:00'
    and time_to = time '22:00'
    and status = 'waiting_for_payment'
    and note = 'STAGING TEST – record_payment_state_change doplněk'
  returning id
)
select
  (select count(*) from deleted_audit) as deleted_audit_rows,
  (select array_agg(id) from deleted_payment) as deleted_payment_ids,
  (select array_agg(id) from deleted_reservation) as deleted_reservation_ids;

commit;
```

Očekávání: `deleted_payment_ids = {00000000-0000-4000-9100-000000000011}` a `deleted_reservation_ids = {00000000-0000-4000-9100-000000000001}`. `deleted_audit_rows` odpovídá počtu předem zkontrolovaných testovacích auditních řádků. Pokud se nevrátí testovací ID platby nebo rezervace, cleanup nepovažuj za dokončený a proveď ruční kontrolu před dalším mazáním.

Po cleanupu ověř, že nezůstaly žádné testovací záznamy:

```sql
select
  (select count(*) from public.payments where id = '00000000-0000-4000-9100-000000000011') as remaining_payments,
  (select count(*) from public.reservations where id = '00000000-0000-4000-9100-000000000001') as remaining_reservations,
  (select count(*) from public.payment_audit_log where payment_id = '00000000-0000-4000-9100-000000000011') as remaining_audit_rows;
```

Očekávání: všechny tři hodnoty jsou `0`.

## Evidence výsledku

Po reálném staging průchodu doplň do `docs/gopay-faze-3-runbook.md` datum, kdo ověřil a výsledek pro každý scénář. Dokud průchod neproběhne na staging databázi, nesmí být tyto scénáře označené jako runtime `PASS`.
