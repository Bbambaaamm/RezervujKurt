# Automatické spouštění notifikačního workeru

## Problém a zvolené řešení

Edge Function `process-notification-outbox` bezpečně zpracovává transakční outbox,
ale bez externího impulzu se nespustí. Ruční `curl` proto nahrazuje nativní
Supabase Cron:

- `pg_cron` spustí úlohu každou minutu;
- `pg_net` asynchronně zavolá Edge Function metodou `POST`;
- URL projektu a service-role klíč zůstanou šifrované v Supabase Vault;
- verzovaný SQL snippet obsahuje pouze názvy secrets, nikdy jejich hodnoty.

Jde o doporučenou variantu pro malý až střední rezervační systém. Scheduler běží
ve stejné platformě jako databáze a Edge Function, nevyžaduje další službu ani
novou aplikační dependency a podporuje minutovou přesnost.

SQL je záměrně uložený jako
`supabase/snippets/schedule_notification_outbox_worker.sql`, nikoli jako migrace.
Lokální `supabase db reset` ani staging bez připravených produkčních Vault secrets
tak neselžou. Aktivace scheduleru je jednorázový provozní krok pro každé
prostředí.

## Porovnání s GitHub Actions

| Kritérium | Supabase Cron + Vault (doporučeno) | GitHub Actions |
|---|---|---|
| Interval | Každou minutu (`* * * * *`) | Nejkratší podporovaný interval je 5 minut |
| Spolehlivost času | Scheduler je u databáze; stále je nutné monitorovat | Plánovaný běh může být při zatížení GitHubu opožděný |
| Secrets | Zůstávají v Supabase Vault | Musely by být v GitHub Actions Secrets |
| Provoz | Jedna platforma, žádný checkout ani runner | Další CI workflow a závislost na dostupnosti GitHub Actions |
| Náklady | Bez dalšího runneru; v rámci limitů Supabase projektu | Spotřebovává Actions minuty u privátního repozitáře |
| Ruční spuštění | SQL `net.http_post`, Dashboard nebo bezpečný lokální `curl` | Pohodlné `workflow_dispatch` |

GitHub Actions zde není implementováno, protože workflow s cronem každou minutu
by deklarovalo nepodporovaný provozní kontrakt. Pokud by se požadavek změnil na
pět minut, lze přidat fallback workflow s `workflow_dispatch` a repository nebo
environment secrets. Pro aktuální požadavek by ale šlo o horší řešení.

## Jednorázové produkční nastavení

### 1. Předpoklady

1. Edge Function `process-notification-outbox` je nasazená.
2. V `supabase/config.toml` zůstává `verify_jwt = true`.
3. Edge Function má nastavené `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` a
   `SITE_URL`.
4. V Supabase Dashboardu jsou povolená rozšíření `pg_cron` a `pg_net`.
5. Nastavení provádí správce produkčního Supabase projektu.

### 2. Secrets v Supabase Vault

V Dashboardu otevři **Project Settings → Vault** a vytvoř:

| Název secretu | Hodnota |
|---|---|
| `notification_worker_project_url` | Základní URL projektu, např. `https://<project-ref>.supabase.co` |
| `notification_worker_service_role_key` | Service-role klíč stejného Supabase projektu |

Hodnoty nevkládej do SQL snippetu, repozitáře, PR, issue ani logu. Service-role
klíč má privilegovaný přístup a musí zůstat pouze na serverové straně. URL a klíč
musí patřit ke stejnému prostředí.

### 3. Aktivace cronu

V produkčním **SQL Editoru** otevři obsah souboru
`supabase/snippets/schedule_notification_outbox_worker.sql` a spusť jej. Snippet:

1. ověří, že oba očekávané Vault secrets existují právě jednou;
2. založí nebo aktualizuje pojmenovanou cron úlohu;
3. každou minutu odešle autorizovaný `POST`;
4. nastaví síťový timeout 30 sekund.

Ověř konfiguraci bez zobrazení secretů:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'process-notification-outbox-every-minute';
```

Očekávaný výsledek je jeden aktivní řádek se schedule `* * * * *`.

### 4. Ruční bezpečné spuštění

Pro okamžitý test lze v SQL Editoru spustit stejný síťový požadavek bez čekání na
cron:

```sql
select net.http_post(
  url := rtrim(
    (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'notification_worker_project_url'
    ),
    '/'
  ) || '/functions/v1/process-notification-outbox',
  headers := jsonb_build_object(
    'Authorization',
    'Bearer ' || (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'notification_worker_service_role_key'
    ),
    'Content-Type',
    'application/json'
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 30000
) as request_id;
```

Výstupem je pouze `request_id`. Samotný HTTP výsledek ověř podle monitoringu níže.

## Ověření end-to-end

1. Vytvoř jednoznačně označenou testovací rezervaci ve stavu `pending`.
2. Ověř, že v `notification_outbox` vznikl řádek `reservation.created`.
3. Počkej nejvýše dvě minuty.
4. Ověř, že řádek přešel do `sent`, `processed_at` je vyplněné a
   `last_error is null`.
5. Ověř doručení e-mailu správnému administrátorovi.
6. Zruš testovací rezervaci standardním aplikačním postupem.

Kontrolní dotaz:

```sql
select
  id,
  reservation_id,
  status,
  attempt_count,
  next_attempt_at,
  processed_at,
  last_error,
  created_at,
  updated_at
from public.notification_outbox
order by created_at desc
limit 20;
```

## Monitoring

### Jak poznat, že scheduler běží

Poslední běhy cronu:

```sql
select
  runid,
  status,
  start_time,
  end_time,
  return_message
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'process-notification-outbox-every-minute'
)
order by start_time desc
limit 20;
```

Nový záznam má vznikat přibližně každou minutu. Stav cronu `succeeded` potvrzuje,
že PostgreSQL předal asynchronní požadavek do `pg_net`; sám o sobě ještě
nepotvrzuje HTTP 2xx ani odeslání e-mailu.

### Jak poznat, že HTTP volání selhalo

`pg_net` drží odpovědi jen omezenou dobu, proto incident kontroluj bez odkladu:

```sql
select
  id,
  status_code,
  error_msg,
  created
from net._http_response
where status_code >= 400
   or error_msg is not null
order by created desc
limit 20;
```

Současně zkontroluj **Edge Functions → process-notification-outbox → Logs**.
Opakované `401` znamená typicky chybějící, neplatný nebo cizí service-role klíč.
Stav `500` znamená chybu konfigurace nebo spuštění workeru; detail hledej v logu
Edge Function, nikoli v klientské aplikaci.

### Jak sledovat neodeslané notifikace

Souhrn fronty:

```sql
select status, count(*) as pocet, min(created_at) as nejstarsi
from public.notification_outbox
where status <> 'sent'
group by status
order by status;
```

Položky vyžadující pozornost:

```sql
select
  id,
  reservation_id,
  status,
  attempt_count,
  next_attempt_at,
  last_error,
  created_at,
  updated_at
from public.notification_outbox
where status = 'failed'
   or (
     status = 'pending'
     and next_attempt_at <= now()
     and created_at < now() - interval '5 minutes'
   )
   or (
     status = 'processing'
     and processing_started_at < now() - interval '6 minutes'
   )
order by created_at;
```

Doporučený provozní práh:

- `failed > 0`: incident k ruční kontrole;
- splatný `pending` starší než 5 minut: scheduler nebo worker pravděpodobně neběží;
- `processing` starší než 6 minut: zkontrolovat worker; další běh může položku po
  vypršení pětiminutového lease znovu převzít.

Pro malý systém stačí tyto dotazy kontrolovat po releasu a při incidentu.
Pro aktivní produkci je vhodné přidat Supabase Database Webhook nebo externí
monitoring nad agregovaným pohledem, ale bez zpřístupnění tabulky klientům.

## Rotace klíče, pozastavení a odstranění

Po rotaci service-role klíče aktualizuj pouze Vault secret
`notification_worker_service_role_key`; SQL ani aplikaci není nutné měnit.
Následně proveď ruční spuštění a end-to-end kontrolu.

Dočasné pozastavení:

```sql
select cron.alter_job(
  (
    select jobid
    from cron.job
    where jobname = 'process-notification-outbox-every-minute'
  ),
  active := false
);
```

Opětovné zapnutí použije stejný příkaz s `active := true`.

Trvalé odstranění:

```sql
select cron.unschedule('process-notification-outbox-every-minute');
```

Pozastavení scheduleru nemaže outbox. Nové události zůstanou `pending` a po
obnovení se zpracují podle stávající retry logiky.

## Bezpečnostní a provozní dopady

- Business logika rezervací, databázový trigger i Edge Function zůstávají beze
  změny.
- Cron může krátkodobě překrýt předchozí běh. Atomický claim se `skip locked` a
  unikátní worker token brání dvojímu převzetí stejné události.
- Service-role klíč je nutný kvůli stávajícímu autorizačnímu kontraktu funkce.
  Vault snižuje riziko úniku, ale správci databáze k němu mají privilegovaný
  přístup.
- Supabase Free projekt může být při neaktivitě pozastaven; po obnovení ověř cron,
  Edge Function a backlog outboxu.
