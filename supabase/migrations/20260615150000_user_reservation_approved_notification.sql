-- Schválení rezervace zařadí uživatelskou notifikaci do stejného transakčního
-- outboxu. Existující unikátní klíč (event_type, reservation_id) zajišťuje,
-- že pro jednu rezervaci vznikne nejvýše jedna událost tohoto typu.
create or replace function public.enqueue_reservation_approved_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_outbox (
    event_type,
    reservation_id,
    payload
  )
  values (
    'reservation.approved',
    new.id,
    jsonb_build_object(
      'reservation_id', new.id,
      'approved_at', now()
    )
  )
  on conflict (event_type, reservation_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_reservation_approved_notification on public.reservations;

create trigger trg_reservation_approved_notification
after update of status on public.reservations
for each row
when (old.status = 'pending' and new.status = 'approved')
execute function public.enqueue_reservation_approved_notification();
