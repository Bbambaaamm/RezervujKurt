select
  id,
  court_id,
  reservation_date,
  time_from,
  time_to,
  status
from public.reservations
where reservation_date = '2026-05-21'
order by court_id, time_from;
