-- Produkční plánovač pro automatické schvalování rezervací přihlášených uživatelů.
--
-- Před spuštěním:
-- 1. V Supabase Dashboardu povol rozšíření pg_cron.
-- 2. Aplikuj migrace včetně 20260810120000_auto_approve_user_reservations.sql.
--
-- Job běží každou minutu a schvaluje pouze pending rezervace uživatelů s rolí
-- user, member nebo admin, které jsou staré alespoň 1 minutu. Historický název
-- jobu a funkce zůstává zachovaný kvůli kompatibilitě s existujícím nasazením.

select cron.schedule(
  'auto-approve-member-reservations-every-minute',
  '* * * * *',
  $cron$
    select public.auto_approve_member_reservations();
  $cron$
);
