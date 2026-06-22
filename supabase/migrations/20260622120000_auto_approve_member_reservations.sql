-- Automatické schvalování rezervací členů a administrátorů.
-- Funkci spouští plánovač z SQL snippetu schedule_member_reservation_auto_approval.sql.

create or replace function public.log_reservation_update_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_changed_by uuid;
  v_is_auto_approval boolean;
begin
  -- Pokud se řádek fakticky nezměnil, audit neukládáme.
  if new is not distinct from old then
    return new;
  end if;

  v_is_auto_approval := current_setting('app.reservation_auto_approval', true) = 'true'
    and old.status = 'pending'
    and new.status = 'approved';

  if v_is_auto_approval then
    v_action := 'auto_approve';
    v_changed_by := null;
  elsif new.status = 'cancelled' and old.status is distinct from new.status then
    v_action := 'cancel';
    v_changed_by := coalesce(auth.uid(), new.user_id);
  else
    v_action := 'update';
    v_changed_by := coalesce(auth.uid(), new.user_id);
  end if;

  insert into public.reservation_audit_log (
    reservation_id,
    changed_by,
    action,
    old_status,
    new_status,
    payload
  )
  values (
    new.id,
    v_changed_by,
    v_action,
    old.status,
    new.status,
    jsonb_build_object(
      'old', to_jsonb(old),
      'new', to_jsonb(new),
      'source', case when v_is_auto_approval then 'system:auto_approval' else 'user' end
    )
  );

  return new;
end;
$$;

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
    and p.role in ('member', 'admin')
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
