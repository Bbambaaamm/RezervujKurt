-- Privacy-by-design: audit rezervací uchovává pouze provozně nutná metadata.
-- Poznámka a celé snapshoty rezervace se v auditu zbytečně duplikovaly.

create or replace function public.log_reservation_create_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
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
    new.user_id,
    'create',
    null,
    new.status,
    jsonb_build_object(
      'reservation_date', new.reservation_date,
      'time_from', new.time_from,
      'time_to', new.time_to,
      'court_id', new.court_id
    )
  );

  return new;
end;
$$;

create or replace function public.log_reservation_update_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_changed_by uuid;
begin
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
      'reservation_date', new.reservation_date,
      'time_from', new.time_from,
      'time_to', new.time_to,
      'court_id', new.court_id
    )
  );

  return new;
end;
$$;

-- Ze starších záznamů odstraníme pouze duplicitní volný text a snapshoty.
-- Identita aktéra, akce, stav a čas auditu zůstávají zachované.
update public.reservation_audit_log
set payload = payload - 'note' - 'old' - 'new'
where payload ?| array['note', 'old', 'new'];
