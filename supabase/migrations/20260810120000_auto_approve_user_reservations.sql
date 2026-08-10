-- Automatické schvalování rozšiřujeme také na běžné přihlášené uživatele.
-- Název funkce zůstává zachovaný, aby nebylo nutné měnit existující pg_cron job.

create or replace function public.auto_approve_member_reservations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  approved_count integer := 0;
begin
  perform set_config('app.reservation_auto_approval', 'true', true);

  update public.reservations as r
  set
    status = 'approved',
    updated_at = now()
  from public.profiles as p
  where p.id = r.user_id
    and p.role in ('user', 'member', 'admin')
    and r.status = 'pending'
    and r.created_at <= now() - interval '1 minute';

  get diagnostics approved_count = row_count;

  perform set_config('app.reservation_auto_approval', 'false', true);

  return approved_count;
exception
  when others then
    perform set_config('app.reservation_auto_approval', 'false', true);
    raise;
end;
$$;

revoke all on function public.auto_approve_member_reservations() from public;
grant execute on function public.auto_approve_member_reservations() to service_role;
