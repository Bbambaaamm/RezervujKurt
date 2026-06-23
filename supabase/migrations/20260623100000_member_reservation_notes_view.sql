-- Vlastníci rezervací, členové a administrátoři smí v kalendáři vidět poznámky k obsazeným termínům.
-- Pohled nevrací osobní údaje ani user_id; slouží pouze k doplnění poznámek k veřejné obsazenosti.
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
where r.status in ('pending', 'approved')
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
