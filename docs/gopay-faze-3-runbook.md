# Runbook: bezpečné nasazení fáze 3 GoPay bez aktivace plateb

## Problém

Projekt už obsahuje přípravu pro stav `waiting_for_payment`, který bude později blokovat termín během platby kartou. Tento stav ale mění sdílený kontrakt mezi databází, occupancy views a aplikačním čtením rezervací. Pokud by se nasadil bez kontroly prostředí a smoke testů, mohl by omylem ovlivnit současný rezervační systém.

## Doporučené řešení

Nasadit pouze kontraktovou podporu `waiting_for_payment` za vypnutými platebními flagy. V této fázi se nesmí vytvářet platební rezervace, nesmí se volat GoPay API a nesmí se měnit běžné flow vytváření, schvalování ani rušení rezervací.

## Co se nasazuje

- Aplikační kód, který umí stav `waiting_for_payment` bezpečně přečíst a v anonymním veřejném gridu jej maskovat jako běžně obsazený slot.
- Databázová migrace `supabase/migrations/20260721133000_waiting_for_payment_occupancy.sql`, která rozšiřuje povolené stavy rezervací, overlap ochranu a occupancy views.
- Žádné GoPay credentials, žádné GoPay volání, žádný platební checkout a žádné zapnutí platebních feature flagů.

## Povinné kroky vlastníka před staging nasazením

1. Ověřit, že pracuje se staging Supabase projektem `rrlvlgoiwesteevzupyi`, nikoli s production projektem `jrmenwgaponihgzroduw`.
2. Ověřit, že staging Vercel deployment používá staging Supabase URL a staging anon key.
3. Zkontrolovat, že staging nemá nastavené produkční secrets ani produkční Supabase URL.
4. Ověřit, že platební capability flag v aplikační konfiguraci zůstává vypnutý: `PAYMENTS_GOPAY_CODE_AVAILABLE=false` nebo není vůbec nastavený.
5. Pokud už je v daném prostředí aplikovaná migrace `supabase/migrations/20260721150000_payment_feature_flags.sql`, v databázi ověřit, že dynamické platební flagy zůstávají vypnuté: `gopay_create_enabled`, `gopay_webhook_processing_enabled`, `payment_expiration_enabled`, `auto_refund_enabled` a `payment_admin_monitoring_enabled`. Pokud tabulka `public.payment_feature_flags` ještě neexistuje, tento krok nepouštět a nepřidávat kvůli němu žádnou další migraci mimo scope fáze 3.
6. Před migrací spustit read-only kontrolu aktuálních statusů rezervací:

```sql
select status, count(*)
from public.reservations
group by status
order by status;
```

7. Před migrací zkontrolovat dlouhé transakce, které by mohly držet zámky:

```sql
select pid, state, now() - xact_start as age, query
from pg_stat_activity
where xact_start is not null
  and now() - xact_start > interval '30 seconds'
order by xact_start asc;
```

8. Před migrací ručně zkontrolovat SQL soubor `supabase/migrations/20260721133000_waiting_for_payment_occupancy.sql` a potvrdit, že neobsahuje žádné GoPay endpointy, žádné změny uživatelského create flow a žádné destruktivní mazání dat.

## Staging nasazení

1. Nasadit aktuální aplikační kód na staging.
2. Aplikovat databázovou migraci na staging ručně přes Supabase CLI nebo Supabase Dashboard podle běžného provozního postupu projektu.
3. Pokud migrace skončí na `lock_timeout`, nepouštět ji ve smyčce. Nejdříve zjistit blokující transakci a zopakovat nasazení až po jejím ukončení.
4. Po migraci ověřit, že se v běžném flow nevytvořila žádná platební rezervace:

```sql
select count(*) as waiting_for_payment_count
from public.reservations
where status = 'waiting_for_payment';
```

5. Pokud už je v daném prostředí aplikovaná migrace `supabase/migrations/20260721120000_create_payments_foundation.sql`, ověřit, že nevznikly žádné nové platby. Pokud tabulka `public.payments` ještě neexistuje, tento krok nepouštět a nepřidávat kvůli němu žádnou další migraci mimo scope fáze 3:

```sql
select count(*) as payments_count
from public.payments;
```

## Povinný staging smoke test současného systému

Na stagingu musí projít celý současný rezervační lifecycle bez použití GoPay:

1. Anonymní uživatel otevře veřejný rezervační grid.
2. Přihlášený běžný uživatel vytvoří běžnou rezervaci ve stavu `pending`.
3. Nová rezervace okamžitě blokuje termín v gridu.
4. Druhý pokus o překryv stejného slotu je odmítnutý.
5. Administrátor vidí běžnou `pending` rezervaci v admin seznamu.
6. Administrátor běžnou `pending` rezervaci schválí.
7. Schválená rezervace dál blokuje slot.
8. Administrátor vytvoří nebo vybere další běžnou `pending` rezervaci a zruší ji.
9. Zrušená rezervace uvolní slot.
10. Uživatel zruší vlastní povolenou budoucí rezervaci.
11. Member/admin auto-approve workflow dál vytváří pouze běžné stavy, které existovaly před platební přípravou.
12. Ve staging logách není žádné volání GoPay API ani pokus o vytvoření checkoutu.

## Povinné kroky vlastníka před production nasazením

1. Pokračovat do production teprve po úspěšném staging smoke testu z předchozí části.
2. Ověřit, že production Supabase project ref je `jrmenwgaponihgzroduw`.
3. Ověřit, že production Vercel deployment používá production Supabase URL a production anon key.
4. Znovu potvrdit, že platební capability flag zůstává v production vypnutý. Dynamické platební flagy kontrolovat pouze tehdy, pokud už v production existuje `public.payment_feature_flags`; kvůli fázi 3 se nemá přidávat migrace `20260721150000_payment_feature_flags.sql` mimo plánovaný release scope.
5. Naplánovat migraci na dobu nízkého provozu, protože změna constraintů může krátce potřebovat databázový zámek.
6. Těsně před migrací zopakovat read-only kontrolu statusů a dlouhých transakcí stejnými SQL dotazy jako na stagingu.
7. Aplikovat migraci jako samostatný ruční databázový release krok, ne jako nepozorovaný vedlejší efekt aplikačního deploye.

## Povinný production smoke test po migraci

Po production migraci musí vlastník ověřit:

1. Veřejný grid se načte a ukazuje existující obsazenost.
2. Přihlášený uživatel vytvoří běžnou rezervaci.
3. Rezervace je ve stavu `pending`, pokud pro danou roli neplatí stávající auto-approve pravidlo.
4. Admin běžnou čekající rezervaci schválí nebo zruší stejně jako před změnou.
5. Zrušená rezervace uvolní slot.
6. Překryv obsazeného slotu je odmítnutý.
7. Pokud existuje tabulka `payments`, nepřibyly v ní řádky.
8. V produkčních logách není žádné GoPay API volání.
9. Platební capability flag zůstává vypnutý a dynamické platební flagy zůstávají vypnuté, pokud jejich tabulka v production už existuje.

## Rollback a stop podmínky

- Pokud selže aplikační deployment před databázovou migrací, rollback je standardní návrat na předchozí aplikační verzi.
- Pokud databázová migrace selže na `lock_timeout`, nic neopravovat naslepo; migrace se má zopakovat až po vyřešení zámku.
- Pokud po migraci selže běžné vytvoření, schválení nebo zrušení rezervace, zastavit další platební práce, ponechat platební flagy vypnuté a řešit dopřednou opravnou migraci nebo aplikační opravu.
- Neprovádět destruktivní rollback databázových změn, pokud pouze přidaly podporu nového stavu a nejsou příčinou incidentu.
- Dokud neprojde production smoke test, nesmí následovat fáze 4 ani žádné GoPay sandbox/prod volání.

## Výsledek staging ověření RPC `record_payment_state_change` z 22. 7. 2026

Výsledek ověřené části: `PASS`.

Na stagingu bylo ověřeno, že funkce `public.record_payment_state_change()` běží jako `SECURITY DEFINER`, má nastavený `search_path = public, pg_temp` a `EXECUTE` má pouze `service_role` společně s vlastníkem `postgres`. Role `anon` ani `authenticated` nemají grant `EXECUTE`.

Úspěšně prošly tyto povolené přechody platebního stavu:

- `created → awaiting_payment`,
- `awaiting_payment → paid`,
- `created → failed`,
- `failed → requires_manual_review`,
- `awaiting_payment → expired` po dosažení uloženého `expires_at`.

V rámci úspěšných přechodů bylo potvrzeno:

- `provider_payment_id` se zapisuje pouze při přechodu do `awaiting_payment`,
- `expires_at` se zapisuje pouze při přechodu do `awaiting_payment`,
- `paid_at` se zapisuje pouze při přechodu do `paid`,
- `failed_at` se zapisuje pouze při přechodu do `failed`,
- `last_error` se zapisuje pouze při přechodu do `failed`,
- `attempt_count` se navyšuje pouze při přechodu do `awaiting_payment`,
- `refund_status` zůstává beze změny,
- auditní `event_type` je odvozován interně funkcí,
- auditní záznam používá skutečný `reservation_id` z aktualizované platby,
- update platby i vložení auditního záznamu probíhají atomicky.

Úspěšně bylo potvrzeno odmítnutí těchto scénářů:

- `paid → failed`,
- `created → failed` s podstrčeným `paid_at`,
- `failed → requires_manual_review` s podstrčeným `provider_payment_id`,
- `awaiting_payment → expired` před dosažením uloženého `expires_at`.

Ve všech odmítnutých scénářích bylo ověřeno, že se nezměnil žádný řádek v `payments` a nevznikl žádný nový řádek v `payment_audit_log`.

Samostatně byl ověřen atomický rollback celé transakce při selhání vložení do `payment_audit_log` testem s nepovolenou hodnotou `source`. Potvrzeno bylo, že update platby byl vrácen, auditní záznam nevznikl a transakce byla plně atomická.

Jako dosud neověřené zůstávají tyto scénáře; neoznačovat je jako `PASS`, dokud neproběhne samostatné staging ověření:

- no-op přechod,
- neexistující `payment_id`,
- odmítnutí `EXECUTE` jako `authenticated`,
- odmítnutí `EXECUTE` jako `anon`,
- `awaiting_payment → paid` s nepovoleným `failed_at`.
