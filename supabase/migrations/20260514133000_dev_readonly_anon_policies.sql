-- Dev read-only přístup pro anonymní klient (UI bez auth flow).
-- Cíl: povolit jen SELECT na aktivní kurty a veřejný přehled rezervací.

-- Courts: zrušení původní select policy vázané na authenticated roli.
drop policy if exists "courts_select_authenticated" on public.courts;

create policy "courts_select_active_anon"
  on public.courts
  for select
  to anon
  using (is_active = true);

-- Reservations: anonymní read-only přehled pro grid.
create policy "reservations_select_public_overview_anon"
  on public.reservations
  for select
  to anon
  using (true);
