-- Produkční plánovač pro Edge Function process-notification-outbox.
--
-- Před spuštěním:
-- 1. V Supabase Dashboardu povol rozšíření pg_cron a pg_net.
-- 2. Do Vaultu ulož secrets notification_worker_project_url a
--    notification_worker_service_role_key podle docs/notifikacni-worker.md.
--
-- Tento soubor neobsahuje žádné skutečné credentials a není databázovou migrací,
-- protože produkční Vault secrets nejsou dostupné při lokálním db resetu.

do $$
declare
  project_url_count integer;
  service_role_key_count integer;
begin
  select count(*)
  into project_url_count
  from vault.decrypted_secrets
  where name = 'notification_worker_project_url';

  select count(*)
  into service_role_key_count
  from vault.decrypted_secrets
  where name = 'notification_worker_service_role_key';

  if project_url_count <> 1 then
    raise exception
      'Vault musí obsahovat právě jeden secret notification_worker_project_url.';
  end if;

  if service_role_key_count <> 1 then
    raise exception
      'Vault musí obsahovat právě jeden secret notification_worker_service_role_key.';
  end if;
end;
$$;

select cron.schedule(
  'process-notification-outbox-every-minute',
  '* * * * *',
  $cron$
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
  $cron$
);
