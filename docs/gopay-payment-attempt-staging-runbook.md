# Staging ověření identity platebního pokusu

Tento runbook ověřuje migraci `20260728160000_bind_payment_attempt_snapshot.sql` na stagingu. Source-level testy nejsou náhradou runtime ověření PostgreSQL. Produkční migrace smí následovat až po zaznamenání výsledků této matice.

## Preflight před migrací

```sql
select count(*) as payments_count from public.payments;
```

Zapište počet řádků a zvolte řízené release okno. `ALTER TABLE` a běžný unikátní index mohou krátce blokovat zápisy; migrace při čekání delším než pět sekund bezpečně selže.

Po staging migraci ověřte, že historické řádky zůstaly bez nové identity a že každý nový pokus má oba snapshotové sloupce:

```sql
select
  count(*) as total_rows,
  count(*) filter (where payment_attempt_id is not null) as rows_with_attempt_id,
  count(*) filter (where price_per_hour_cents is not null) as rows_with_price_snapshot,
  count(*) filter (
    where (payment_attempt_id is null) <> (price_per_hour_cents is null)
  ) as inconsistent_snapshot_rows
from public.payments;
```

Očekávání: `inconsistent_snapshot_rows = 0`. Stejný preflight počtu řádků proveďte znovu samostatně v produkci těsně před produkčním releasem; staging počet není důkazem produkční velikosti tabulky.

## Oprávnění a konfigurace funkce

Přesnou signaturu ověřte po aplikaci migrace:

```sql
select
  has_function_privilege(
    'anon',
    'public.create_or_get_payment_attempt(uuid,uuid,bigint,date,time,time,text,integer,jsonb)',
    'EXECUTE'
  ) as anon_execute,
  has_function_privilege(
    'authenticated',
    'public.create_or_get_payment_attempt(uuid,uuid,bigint,date,time,time,text,integer,jsonb)',
    'EXECUTE'
  ) as authenticated_execute,
  has_function_privilege(
    'service_role',
    'public.create_or_get_payment_attempt(uuid,uuid,bigint,date,time,time,text,integer,jsonb)',
    'EXECUTE'
  ) as service_role_execute;

select p.prosecdef, p.proconfig
from pg_proc p
where p.oid = 'public.create_or_get_payment_attempt(uuid,uuid,bigint,date,time,time,text,integer,jsonb)'::regprocedure;
```

Očekávání: `anon_execute = false`, `authenticated_execute = false`, `service_role_execute = true`, `prosecdef = true` a `proconfig` obsahuje `search_path=public, pg_temp`.

## Transakční funkční matice

Použijte existující testovací profil, aktivní kurt s nakonfigurovanou cenou a volný budoucí slot. Testovací UUID a slot nesmí kolidovat s jiným staging testem. Testy 1–10 provádějte v `begin; ... rollback;` a po každém kroku ověřte počet odpovídajících řádků v `reservations`, `payments` a `payment_audit_log`.

1. Nové `paymentAttemptId` vytvoří právě jednu rezervaci, jednu platbu a jeden audit.
2. Identický retry vrátí stejná ID, hodinovou cenu, částku, měnu a přesně stejné `expires_at`; počty řádků se nezmění.
3. Stejné UUID s jiným uživatelem skončí `payment_attempt_conflict`.
4. Stejné UUID s jiným kurtem skončí `payment_attempt_conflict`.
5. Stejné UUID s jiným datem nebo časem skončí `payment_attempt_conflict`.
6. Stejné UUID s jinou normalizovanou poznámkou skončí `payment_attempt_conflict`; `null`, prázdný text a text tvořený mezerami se normalizují na `null`.
7. Po změně ceníku identický retry vrátí původní cenu a částku.
8. Při jiném `p_ttl_minutes` identický retry vrátí původní `expires_at`.
9. Stavy `failed`, `cancelled` a `expired` skončí `payment_attempt_terminal`; stav `paid` idempotentně vrátí původní snapshot.
10. Po zrušení rezervace terminálního pokusu lze se stejným slotem a novým `paymentAttemptId` vytvořit právě jeden nový pokus; původní zrušená rezervace zůstane v historii.

Metadata mezi retry úmyslně neporovnávejte: jsou pouze diagnostická, při retry se nepřepisují a nesmí řídit bezpečnostní rozhodnutí.

## Concurrency test

Použijte dvě nezávislé databázové session a v obou zavolejte RPC se stejným novým UUID a shodným payloadem. První session ponechte před commitem otevřenou, druhé volání musí čekat na advisory zámek. Po commitu první session musí druhá vrátit stejná ID a snapshoty. Následně ověřte, že existuje právě jedna rezervace, jedna platba a jeden `payment_created` audit.

Concurrency test neprovádějte pouze sekvenčním SQL skriptem v jedné session; takový test neověří serializaci zámkem.

## Evidence

Do release záznamu uložte datum, staging project ref, SHA migrace, anonymizovaná testovací UUID, výsledky privilege dotazů, matici 1–10 a výsledek dvousession concurrency testu. Neukládejte service-role klíč ani jiné secrets.
