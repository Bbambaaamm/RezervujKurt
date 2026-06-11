-- Náprava dříve udělených širokých grantů pro authenticated.
-- REVOKE je nutný i při bezpečné definici předchozí migrace, protože tato migrace
-- opravuje také databáze, kde už byla její původní širší varianta aplikována.
revoke all privileges on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

revoke all privileges on public.reservations from authenticated;
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

-- Člen může vytvořit pouze vlastní čekající rezervaci. Administrátor si zachovává
-- možnost vložit rezervaci libovolného uživatele a povoleného stavu.
drop policy if exists "reservations_insert_owner_or_admin" on public.reservations;
drop policy if exists "reservations_insert_owner_pending" on public.reservations;
drop policy if exists "reservations_insert_admin" on public.reservations;

create policy "reservations_insert_owner_pending"
  on public.reservations
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

create policy "reservations_insert_admin"
  on public.reservations
  for insert
  to authenticated
  with check (public.is_admin());

-- Člen může svou aktivní rezervaci pouze zrušit. Schválení a ostatní změny stavu
-- zůstávají administrátorovi. Sloupcový grant zároveň zakazuje změnu termínu,
-- kurtu, vlastníka a poznámky existující rezervace.
drop policy if exists "reservations_update_owner_or_admin" on public.reservations;
drop policy if exists "reservations_cancel_owner" on public.reservations;
drop policy if exists "reservations_update_admin" on public.reservations;

create policy "reservations_cancel_owner"
  on public.reservations
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and status in ('pending', 'approved')
  )
  with check (
    user_id = auth.uid()
    and status = 'cancelled'
  );

create policy "reservations_update_admin"
  on public.reservations
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
