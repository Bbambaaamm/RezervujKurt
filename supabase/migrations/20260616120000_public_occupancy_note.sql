-- Zobrazujeme veřejnou poznámku u obsazených slotů v rezervační mřížce.
-- Poznámka je součástí detailu obsazenosti; osobní identifikátory dál nezpřístupňujeme.
create or replace view public.reservation_public_occupancy
with (security_invoker = false, security_barrier = true)
as
select
  r.court_id,
  r.reservation_date,
  r.time_from,
  r.time_to,
  r.status,
  nullif(btrim(r.note), '') as note
from public.reservations r
where r.status in ('pending', 'approved');

revoke all privileges on public.reservation_public_occupancy from public;
revoke all privileges on public.reservation_public_occupancy from anon;
revoke all privileges on public.reservation_public_occupancy from authenticated;

grant select on public.reservation_public_occupancy to anon;
grant select on public.reservation_public_occupancy to authenticated;
