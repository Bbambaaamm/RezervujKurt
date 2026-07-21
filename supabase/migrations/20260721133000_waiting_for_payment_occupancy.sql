-- Stav čekající na platbu blokuje obsazenost, ale veřejný anonymní pohled nesmí prozradit platební detail.

alter table public.reservations
  drop constraint if exists reservations_status_check;

alter table public.reservations
  add constraint reservations_status_check
  check (status in ('waiting_for_payment', 'pending', 'approved', 'cancelled'));

alter table public.reservations
  drop constraint if exists reservations_no_overlap_excl;

alter table public.reservations
  add constraint reservations_no_overlap_excl
  exclude using gist (
    court_id with =,
    reservation_date with =,
    tsrange(
      (reservation_date::timestamp + time_from),
      (reservation_date::timestamp + time_to),
      '[)'
    ) with &&
  )
  where (status in ('waiting_for_payment', 'pending', 'approved'));

alter table public.reservation_audit_log
  drop constraint if exists reservation_audit_log_check;

alter table public.reservation_audit_log
  add constraint reservation_audit_log_check
  check (
    (old_status is null or old_status in ('waiting_for_payment', 'pending', 'approved', 'cancelled'))
    and (new_status is null or new_status in ('waiting_for_payment', 'pending', 'approved', 'cancelled'))
  );

create or replace view public.reservation_public_occupancy
with (security_invoker = false, security_barrier = true)
as
select
  r.court_id,
  r.reservation_date,
  r.time_from,
  r.time_to,
  case
    when r.status = 'waiting_for_payment' then 'approved'
    else r.status
  end as status
from public.reservations r
where r.status in ('waiting_for_payment', 'pending', 'approved');

revoke all privileges on public.reservation_public_occupancy from public;
revoke all privileges on public.reservation_public_occupancy from anon;
revoke all privileges on public.reservation_public_occupancy from authenticated;

grant select on public.reservation_public_occupancy to anon;
grant select on public.reservation_public_occupancy to authenticated;

create or replace view public.reservation_member_occupancy_notes
with (security_invoker = false, security_barrier = true)
as
select
  r.court_id,
  r.reservation_date,
  r.time_from,
  r.time_to,
  r.status,
  r.note
from public.reservations r
where r.status in ('waiting_for_payment', 'pending', 'approved')
  and (
    r.user_id = auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('member', 'admin')
    )
  );

revoke all privileges on public.reservation_member_occupancy_notes from public;
revoke all privileges on public.reservation_member_occupancy_notes from anon;
revoke all privileges on public.reservation_member_occupancy_notes from authenticated;

grant select on public.reservation_member_occupancy_notes to authenticated;
