-- Explicitní databázová oprávnění pro operace přihlášeného uživatele.
-- RLS nadále omezuje dostupné řádky podle vlastníka nebo role administrátora.

grant select on public.courts to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.reservations to authenticated;
grant select on public.reservation_public_occupancy to authenticated;
