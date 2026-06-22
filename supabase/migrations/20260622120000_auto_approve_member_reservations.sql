-- Automatické schvalování rezervací členů a administrátorů.
-- Funkci spouští plánovač z SQL snippetu schedule_member_reservation_auto_approval.sql.

create or replace function public.auto_approve_member_reservations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  approved_count integer := 0;
begin
  update public.reservations as r
  set
    status = 'approved',
    updated_at = now()
  from public.profiles as p
  where p.id = r.user_id
    and p.role in ('member', 'admin')
    and r.status = 'pending'
    and r.created_at <= now() - interval '1 minute';

  get diagnostics approved_count = row_count;

  return approved_count;
end;
$$;

revoke all on function public.auto_approve_member_reservations() from public;
grant execute on function public.auto_approve_member_reservations() to service_role;
