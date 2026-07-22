# Staging runbook: bezpečnostní ověření `payment_user_statuses`

Tento runbook ověřuje, že read-only view `public.payment_user_statuses` izoluje platební stav mezi uživateli a nezpřístupňuje podkladovou tabulku `payments`. Platí pouze pro staging. GoPay flow musí zůstat vypnuté a test nesmí používat produkční credentials.

## Problém a zvolené řešení

View `payment_user_statuses` používá `security_invoker = false` úmyslně. Cílem není dát klientovi přímý `SELECT` na `public.payments`, ale nabídnout úzký bezpečný kontrakt pro budoucí status obrazovku. Podkladová tabulka `payments` zůstává běžným uživatelům nepřístupná a izolace vlastnictví stojí na explicitním filtru `r.user_id = auth.uid()` uvnitř view.

`security_barrier = true` je součást bezpečnostního kontraktu view. Každá budoucí změna definice view, seznamu sloupců, `JOIN`, grantu nebo filtru podle `auth.uid()` vyžaduje samostatné bezpečnostní review.

## Předpoklady

- Staging Supabase project ref je ověřený a není produkční.
- Migrace `20260721170000_payment_user_status_view.sql` je aplikovaná pouze na staging.
- Platební feature flagy zůstávají vypnuté:
  - `gopay_create_enabled = false`
  - `gopay_webhook_processing_enabled = false`
  - `payment_expiration_enabled = false`
  - `auto_refund_enabled = false`
  - `payment_admin_monitoring_enabled = false`
- Test používá dvě oddělené staging identity: uživatel A a uživatel B.

## Příprava testovacích dat

Spusť přes staging SQL editor nebo jiný kontrolovaný service-role nástroj. Nepoužívej produkční databázi.

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
values
  (
    '00000000-0000-4000-8000-0000000000a1',
    '<UUID_UZIVATELE_A>',
    1,
    current_date + 14,
    '08:00',
    '09:00',
    'waiting_for_payment',
    'STAGING-PAYMENT-VIEW-A'
  ),
  (
    '00000000-0000-4000-8000-0000000000b1',
    '<UUID_UZIVATELE_B>',
    1,
    current_date + 14,
    '09:00',
    '10:00',
    'waiting_for_payment',
    'STAGING-PAYMENT-VIEW-B'
  );

insert into public.payments (
  reservation_id,
  idempotency_key,
  amount_cents,
  currency,
  status,
  refund_status,
  expires_at
)
values
  (
    '00000000-0000-4000-8000-0000000000a1',
    'staging-payment-view-a',
    25000,
    'CZK',
    'awaiting_payment',
    'not_requested',
    now() + interval '15 minutes'
  ),
  (
    '00000000-0000-4000-8000-0000000000b1',
    'staging-payment-view-b',
    30000,
    'CZK',
    'awaiting_payment',
    'not_requested',
    now() + interval '15 minutes'
  );

commit;
```

## Ověření dvěma přihlášenými identitami

Nahraď `STAGING_SUPABASE_URL`, `STAGING_ANON_KEY`, `TOKEN_A` a `TOKEN_B` hodnotami ze stagingu. Tokeny získávej pouze pro testovací uživatele.

### Uživatel A vidí pouze platbu A

```bash
curl -sS "$STAGING_SUPABASE_URL/rest/v1/payment_user_statuses?select=*&reservation_id=eq.00000000-0000-4000-8000-0000000000a1" \
  -H "apikey: $STAGING_ANON_KEY" \
  -H "Authorization: Bearer $TOKEN_A"
```

Očekávání: odpověď obsahuje právě jeden řádek s `reservation_id = 00000000-0000-4000-8000-0000000000a1`.

### Uživatel B vidí pouze platbu B

```bash
curl -sS "$STAGING_SUPABASE_URL/rest/v1/payment_user_statuses?select=*&reservation_id=eq.00000000-0000-4000-8000-0000000000b1" \
  -H "apikey: $STAGING_ANON_KEY" \
  -H "Authorization: Bearer $TOKEN_B"
```

Očekávání: odpověď obsahuje právě jeden řádek s `reservation_id = 00000000-0000-4000-8000-0000000000b1`.

### Uživatel A nevidí platbu B ani při přímém filtru podle její rezervace

```bash
curl -sS "$STAGING_SUPABASE_URL/rest/v1/payment_user_statuses?select=*&reservation_id=eq.00000000-0000-4000-8000-0000000000b1" \
  -H "apikey: $STAGING_ANON_KEY" \
  -H "Authorization: Bearer $TOKEN_A"
```

Očekávání: odpověď je prázdné pole `[]`.

### Anonymní klient nesmí view číst

```bash
curl -i "$STAGING_SUPABASE_URL/rest/v1/payment_user_statuses?select=*" \
  -H "apikey: $STAGING_ANON_KEY"
```

Očekávání: HTTP 401/403 nebo ekvivalentní odmítnutí bez dat.

### Přihlášený uživatel nesmí přímo číst `public.payments`

```bash
curl -i "$STAGING_SUPABASE_URL/rest/v1/payments?select=*" \
  -H "apikey: $STAGING_ANON_KEY" \
  -H "Authorization: Bearer $TOKEN_A"
```

Očekávání: HTTP 401/403 nebo ekvivalentní odmítnutí bez dat.

## SQL ověření po aplikaci migrace

Spusť na stagingu přes SQL editor nebo jiný čtecí administrátorský nástroj.

```sql
select
  c.relname as view_name,
  pg_get_userbyid(c.relowner) as view_owner,
  coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'false') as security_invoker,
  coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_barrier'), 'false') as security_barrier
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'payment_user_statuses';
```

Očekávání: `security_invoker = false`, `security_barrier = true`; vlastníka zapiš do evidence staging ověření.

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'payment_user_statuses'
order by grantee, privilege_type;
```

Očekávání: `authenticated` má `SELECT`; `anon` nemá žádný grant.

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('payments', 'reservations')
  and grantee = 'authenticated'
  and privilege_type = 'SELECT'
order by table_name, grantee, privilege_type;
```

Očekávání: pro `payments` migrace nepřidala žádný nový přímý `SELECT` grant pro `authenticated`. Případné existující oprávnění na `reservations` musí odpovídat předchozímu rezervačnímu modelu a nesmí pocházet z této migrace.

```sql
select enabled
from public.payment_feature_flags
where flag_name in (
  'gopay_create_enabled',
  'gopay_webhook_processing_enabled',
  'payment_expiration_enabled',
  'auto_refund_enabled',
  'payment_admin_monitoring_enabled'
)
order by flag_name;
```

Očekávání: všechny hodnoty jsou `false`.

## Úklid testovacích dat

```sql
begin;

delete from public.payments
where reservation_id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000b1'
);

delete from public.reservations
where id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000b1'
);

commit;
```
