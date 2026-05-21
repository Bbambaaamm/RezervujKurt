-- Public occupancy read pro anonymní klient bez osobních údajů.
-- Umožňuje vidět pouze blokující stavy pending/approved.

drop policy if exists "reservations_select_public_overview_anon" on public.reservations;

create policy "reservations_select_public_occupancy_anon"
  on public.reservations
  for select
  to anon
  using (status in ('pending', 'approved'));
