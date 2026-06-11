-- Explicitní databázová oprávnění pro operace přihlášeného uživatele.
-- Sloupcové granty tvoří první vrstvu ochrany; RLS omezuje povolené řádky a stavy.

grant select on public.courts to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

grant select on public.reservations to authenticated;
grant insert (
  user_id,
  court_id,
  reservation_date,
  time_from,
  time_to,
  status,
  note
) on public.reservations to authenticated;
grant update (status) on public.reservations to authenticated;

grant select on public.reservation_public_occupancy to authenticated;
