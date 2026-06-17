-- Centrální turnajové události pro administrační blokaci kurtů.

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) > 0),
  event_date date not null,
  time_from time not null,
  time_to time not null,
  poster_url text,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (time_from < time_to)
);

create index if not exists tournaments_event_date_idx
  on public.tournaments (event_date, time_from);

alter table public.tournaments enable row level security;

drop policy if exists "tournaments_select_public" on public.tournaments;
create policy "tournaments_select_public"
  on public.tournaments
  for select
  using (true);

drop policy if exists "tournaments_insert_admin" on public.tournaments;
create policy "tournaments_insert_admin"
  on public.tournaments
  for insert
  with check (public.is_admin());

drop policy if exists "tournaments_update_admin" on public.tournaments;
create policy "tournaments_update_admin"
  on public.tournaments
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "tournaments_delete_admin" on public.tournaments;
create policy "tournaments_delete_admin"
  on public.tournaments
  for delete
  using (public.is_admin());

-- PostgREST potřebuje explicitní oprávnění nad novou tabulkou.
grant select on table public.tournaments to anon;
grant select, insert, update, delete on table public.tournaments to authenticated;
