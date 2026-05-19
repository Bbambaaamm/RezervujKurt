-- Milestone N.1: audit write hook pro vytvoření rezervace.
-- Trigger zajistí konzistentní audit zápis pro každý úspěšný INSERT do reservations.

create or replace function public.log_reservation_create_audit()
returns trigger
language plpgsql
security definer
set search_path = public
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
      'court_id', new.court_id,
      'note', new.note
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_reservations_audit_create on public.reservations;

create trigger trg_reservations_audit_create
after insert on public.reservations
for each row
execute function public.log_reservation_create_audit();
