-- Veřejná obsazenost kurtů bez osobních údajů.
create or replace view public.reservation_public_occupancy
with (security_invoker = true)
as
select
  r.court_id,
  r.reservation_date,
  r.time_from,
  r.time_to,
  r.status
from public.reservations r
where r.status in ('pending', 'approved');

grant select on public.reservation_public_occupancy to anon;
grant select on public.reservation_public_occupancy to authenticated;
