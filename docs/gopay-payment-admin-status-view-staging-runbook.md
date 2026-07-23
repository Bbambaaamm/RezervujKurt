# Staging ověření admin platebního view

Tento runbook ověřuje, že `public.payment_admin_statuses` je pouze úzký read-only kontrakt pro administrátory a neobchází zákaz přímého čtení `public.payments` běžnými klientskými rolemi. Platí pouze pro staging; test nepouštěj v produkci.

## Problém a zvolené řešení

View `payment_admin_statuses` používá `security_invoker = false` úmyslně. Běžné klientské role nemají mít přímý `SELECT` na `public.payments`, ale administrátor potřebuje provozní read-only přehled platebních stavů. Izolaci proto zajišťuje `security_barrier = true` a explicitní filtr `profiles.id = auth.uid()` společně s `profiles.role = 'admin'` uvnitř view.

View záměrně vrací všechny platební pokusy. Budoucí UI proto nesmí počítat s jedním řádkem na rezervaci. Pokud bude potřeba zobrazit pouze aktuální pokus, má vzniknout samostatný view nebo explicitní dotaz s deterministickým výběrem.

## Předpoklady

- Staging Supabase project ref je ověřený a není produkční.
- Migrace `20260722090000_payment_admin_status_view.sql` je aplikovaná na stagingu jako samostatný databázový krok.
- Platební feature flagy zůstávají vypnuté; tento runbook žádný feature flag neaktivuje.
- Jsou k dispozici tři oddělené identity: administrátor, běžný přihlášený uživatel a anonymní klient.
- Běžný uživatel může být vlastník testovací platební rezervace; ani tehdy nesmí přes admin view vidět vlastní platbu, pokud nemá roli `admin`.

## SQL ověření po aplikaci migrace

Spusť na stagingu přes SQL editor nebo jiný čtecí administrátorský nástroj.

### Struktura a bezpečnostní vlastnosti view

```sql
select
  c.relname as view_name,
  pg_get_userbyid(c.relowner) as view_owner,
  coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'false') as security_invoker,
  coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_barrier'), 'false') as security_barrier
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'payment_admin_statuses';
```

Očekávání: view existuje v `public`, vlastník je očekávaný vlastník databázového objektu pro staging, `security_invoker = false` a `security_barrier = true`.

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'payment_admin_statuses'
order by ordinal_position;
```

Očekávání: view vrací pouze explicitně vyjmenované sloupce definované migrací. Nesmí vracet `idempotency_key`, `metadata` ani `last_error`.

### Granty a zákaz přímého čtení `payments`

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'payment_admin_statuses'
order by grantee, privilege_type;
```

Očekávání: `authenticated` má na view pouze `SELECT`; `anon` nemá na view žádný `SELECT` grant.

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'payments'
  and grantee = 'authenticated'
  and privilege_type = 'SELECT'
order by table_name, grantee, privilege_type;
```

Očekávání: výsledek je prázdný. Role `authenticated` nemá přímý `SELECT` na `public.payments`.

## Příprava testovacích dat

Spusť přes staging SQL editor nebo jiný kontrolovaný service-role nástroj. Nepoužívej produkční databázi. Zástupné hodnoty `<REGULAR_USER_UUID>` a `<ADMIN_USER_UUID>` před spuštěním nahraď aktuálními staging identitami mimo verzovaný repozitář. Identifikátory testovací rezervace a plateb jsou záměrně pevné, aby byl cleanup jednoznačný a šel bezpečně opakovat.

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
  '00000000-0000-4000-9000-000000000001',
  '<REGULAR_USER_UUID>',
  1,
  '2099-12-31',
  '22:00',
  '23:00',
  'waiting_for_payment',
  'STAGING TEST – payment_admin_statuses'
);

insert into public.payments (
  id,
  reservation_id,
  provider_payment_id,
  idempotency_key,
  amount_cents,
  currency,
  status,
  attempt_count,
  refund_status
)
values
  (
    '00000000-0000-4000-9000-000000000011',
    '00000000-0000-4000-9000-000000000001',
    'STAGING-FAILED-001',
    'staging-admin-view-failed-001',
    25000,
    'CZK',
    'failed',
    1,
    'not_requested'
  ),
  (
    '00000000-0000-4000-9000-000000000012',
    '00000000-0000-4000-9000-000000000001',
    'STAGING-AWAITING-002',
    'staging-admin-view-awaiting-002',
    25000,
    'CZK',
    'awaiting_payment',
    2,
    'not_requested'
  );

commit;
```

Očekávání: vznikne jedna testovací rezervace a dva platební pokusy navázané na stejný `reservation_id`.

## Runtime ověření identitami

### Administrátor

Simulace identity:

```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub = '<ADMIN_USER_UUID>';

select
  payment_id,
  reservation_id,
  payment_status,
  refund_status,
  amount_cents,
  currency,
  attempt_count
from public.payment_admin_statuses
where reservation_id = '00000000-0000-4000-9000-000000000001'
order by attempt_count;

rollback;
```

Očekávání: administrátor vidí přesně dva řádky pro stejnou rezervaci. První řádek má `payment_status = failed` a `attempt_count = 1`; druhý řádek má `payment_status = awaiting_payment` a `attempt_count = 2`. Výsledek potvrzuje, že view vrací všechny platební pokusy, nikoliv pouze poslední.

### Běžný přihlášený uživatel

Simulace identity vlastníka testovací rezervace:

```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub = '<REGULAR_USER_UUID>';

select auth.uid() as current_user_id;

select *
from public.payment_admin_statuses
where reservation_id = '00000000-0000-4000-9000-000000000001';

rollback;
```

Očekávání: `auth.uid()` odpovídá dosazené hodnotě `<REGULAR_USER_UUID>` a dotaz na admin view vrátí prázdný výsledek. Platí to i přesto, že běžný uživatel je vlastníkem testovací rezervace; vlastnictví rezervace nedává přístup k admin platebnímu view.

### Anonymní klient

```sql
select *
from public.payment_admin_statuses;
```

Očekávání: dotaz skončí chybou oprávnění, protože `anon` nemá grant na view.

### Přímý přístup k payments

```sql
select *
from public.payments;
```

Očekávání: `authenticated` nemá přímý `SELECT` na `public.payments` a dotaz skončí chybou oprávnění.

## Úklid testovacích dat

Nejprve odstraň testovací platby a až následně testovací rezervaci. `payments.reservation_id` má foreign key na `reservations.id` s `ON DELETE RESTRICT`, takže opačné pořadí by mělo selhat.

Cleanup používej výhradně pevná testovací UUID uvedená v tomto runbooku a stejnou dosazenou hodnotu `<REGULAR_USER_UUID>`, se kterou byla testovací rezervace vytvořena.

```sql
begin;

delete from public.payments
where id in (
  '00000000-0000-4000-9000-000000000011',
  '00000000-0000-4000-9000-000000000012'
)
and reservation_id = '00000000-0000-4000-9000-000000000001';

delete from public.reservations
where id = '00000000-0000-4000-9000-000000000001'
  and user_id = '<REGULAR_USER_UUID>'
  and note = 'STAGING TEST – payment_admin_statuses';

commit;
```

### Závěrečné ověření cleanupu

```sql
select
  (select count(*) from public.payments where id in (
    '00000000-0000-4000-9000-000000000011',
    '00000000-0000-4000-9000-000000000012'
  )) as remaining_payments,
  (select count(*) from public.reservations where id = '00000000-0000-4000-9000-000000000001') as remaining_reservations;
```

Očekávání: `remaining_payments = 0` a `remaining_reservations = 0`.

## Výsledek konkrétního staging testu z 22. 7. 2026

Výsledek: `PASS`.

Před runtime testem bylo na stagingu potvrzeno:

- view existuje v `public`,
- owner view je `postgres`,
- `security_invoker = false`,
- `security_barrier = true`,
- `authenticated` má na view pouze `SELECT`,
- `anon` nemá na view `SELECT`,
- `authenticated` nemá přímý `SELECT` na `public.payments`,
- view obsahuje explicitně vyjmenované sloupce,
- view nevrací `idempotency_key`, `metadata` ani `last_error`,
- view je určeno pouze administrátorům,
- view záměrně vrací všechny platební pokusy, nikoliv pouze poslední pokus.

Použité staging identity nebyly záměrně zapsané do repozitáře. Pro audit výsledek ověř proti internímu staging záznamu mimo verzovaný kód:

- admin: hodnota dosazená za `<ADMIN_USER_UUID>`,
- běžný uživatel: hodnota dosazená za `<REGULAR_USER_UUID>`, `role = user`.

V testu byla vytvořena rezervace `00000000-0000-4000-9000-000000000001` pro uživatele `<REGULAR_USER_UUID>`, kurt `1`, datum `2099-12-31`, čas `22:00` až `23:00`, status `waiting_for_payment` a poznámku `STAGING TEST – payment_admin_statuses`.

Ke stejné rezervaci byly vytvořeny dva platební pokusy:

- `00000000-0000-4000-9000-000000000011` s `provider_payment_id = STAGING-FAILED-001`, `idempotency_key = staging-admin-view-failed-001`, `amount_cents = 25000`, `currency = CZK`, `payment_status = failed`, `attempt_count = 1` a `refund_status = not_requested`,
- `00000000-0000-4000-9000-000000000012` s `provider_payment_id = STAGING-AWAITING-002`, `idempotency_key = staging-admin-view-awaiting-002`, `amount_cents = 25000`, `currency = CZK`, `payment_status = awaiting_payment`, `attempt_count = 2` a `refund_status = not_requested`.

Administrátor při simulaci `set local role authenticated` a dosazeném `request.jwt.claim.sub` viděl přesně dva platební řádky pro stejnou rezervaci. Tím bylo potvrzeno, že admin vidí oba platební pokusy a že view neagreguje pouze poslední pokus.

Běžný uživatel při simulaci `set local role authenticated` a dosazeném `request.jwt.claim.sub` měl potvrzené `auth.uid()` odpovídající dosazené staging identitě, ale dotaz na `public.payment_admin_statuses` nevrátil žádný platební řádek. To platilo i přesto, že byl vlastníkem testovací rezervace.

Celkově bylo potvrzeno, že administrátor vidí platební data, běžný uživatel nevidí žádná data ani platbu vlastní rezervace, view vrací více platebních pokusů ke stejné rezervaci, přímý přístup k `payments` zůstává zakázaný a citlivé interní sloupce nejsou ve view vystavené.
