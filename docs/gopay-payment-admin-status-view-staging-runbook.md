# Staging ověření admin platebního view

Tento runbook ověřuje, že `public.payment_admin_statuses` je pouze úzký read-only kontrakt pro administrátory a neobchází zákaz přímého čtení `public.payments` běžnými klientskými rolemi.

## Předpoklady

- Migrace `20260722090000_payment_admin_status_view.sql` je aplikovaná na stagingu jako samostatný databázový krok.
- Staging obsahuje alespoň jednu testovací rezervaci s navázaným řádkem v `payments`.
- Jsou k dispozici tři oddělené identity: administrátor, běžný přihlášený uživatel a anonymní klient.
- Běžný uživatel může být vlastník testovací platební rezervace; ani tehdy nesmí přes admin view vidět vlastní platbu, pokud nemá roli `admin`.

## Ověření práv a viditelnosti

### Administrátor

```sql
select payment_id, reservation_id, payment_status, refund_status, amount_cents, currency
from public.payment_admin_statuses
order by created_at desc;
```

Očekávání: administrátor vidí očekávané platební řádky a výsledek neobsahuje `idempotency_key`, `metadata` ani `last_error`.

### Běžný přihlášený uživatel

```sql
select *
from public.payment_admin_statuses;
```

Očekávání: dotaz projde, ale vrátí prázdné pole `[]`, a to i pro uživatele, který vlastní rezervaci s platbou.

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

## Kontrakt více platebních pokusů

`payment_admin_statuses` záměrně vrací všechny platební pokusy. Budoucí UI proto nesmí počítat s jedním řádkem na rezervaci. Pokud bude potřeba zobrazit pouze aktuální pokus, má vzniknout samostatný view nebo explicitní dotaz s deterministickým výběrem.
