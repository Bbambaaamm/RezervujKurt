-- Veřejnou obsazenost zpřístupňujeme pouze přes pohled bez osobních údajů.
-- Pohled záměrně používá práva vlastníka, aby anon i authenticated viděli stejnou
-- obsazenost bez nutnosti otevřít zdrojovou tabulku reservations anonymní roli.
drop policy if exists "reservations_select_public_occupancy_anon" on public.reservations;

revoke all privileges on public.reservations from anon;

create or replace view public.reservation_public_occupancy
with (security_invoker = false, security_barrier = true)
as
select
  r.court_id,
  r.reservation_date,
  r.time_from,
  r.time_to,
  r.status
from public.reservations r
where r.status in ('pending', 'approved');

revoke all privileges on public.reservation_public_occupancy from public;
revoke all privileges on public.reservation_public_occupancy from anon;
revoke all privileges on public.reservation_public_occupancy from authenticated;

grant select on public.reservation_public_occupancy to anon;
grant select on public.reservation_public_occupancy to authenticated;

-- Trigger obslouží nové uživatele a ON CONFLICT dovoluje bezpečné opakování.
-- Fallback zajistí neprázdný full_name i pro nestandardní auth záznam bez e-mailu.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Uživatel'
    ),
    new.email
  )
  on conflict (id) do update
  set email = coalesce(excluded.email, profiles.email);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- Uživatelé vytvoření před nasazením triggeru potřebují jednorázový backfill.
insert into public.profiles (id, full_name, email)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Uživatel'
  ),
  u.email
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
)
on conflict (id) do nothing;
