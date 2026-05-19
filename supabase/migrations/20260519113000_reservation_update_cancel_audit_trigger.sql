-- Milestone N.2: audit write hook pro změnu/zrušení rezervace.
-- Trigger zapisuje audit při každém UPDATE s rozlišením action=update/cancel.

create or replace function public.log_reservation_update_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_changed_by uuid;
begin
  -- Pokud se řádek fakticky nezměnil, audit neukládáme.
  if new is not distinct from old then
    return new;
  end if;

  if new.status = 'cancelled' and old.status is distinct from new.status then
    v_action := 'cancel';
  else
    v_action := 'update';
  end if;

  v_changed_by := coalesce(auth.uid(), new.user_id);

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
      'new', to_jsonb(new)
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_reservations_audit_update on public.reservations;

create trigger trg_reservations_audit_update
after update on public.reservations
for each row
execute function public.log_reservation_update_audit();
