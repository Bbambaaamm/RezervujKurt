-- Produkční plánovač pro automatické schvalování rezervací členů a administrátorů.
--
-- Před spuštěním:
-- 1. V Supabase Dashboardu povol rozšíření pg_cron.
-- 2. Aplikuj migraci 20260622120000_auto_approve_member_reservations.sql.
--
-- Job běží každou minutu a schvaluje pouze pending rezervace uživatelů s rolí
-- member nebo admin, které jsou staré alespoň 1 minutu.

select cron.schedule(
  'auto-approve-member-reservations-every-minute',
  '* * * * *',
  $cron$
    select public.auto_approve_member_reservations();
  $cron$
);
