-- Veřejná stránka /rezervace potřebuje anonymně načíst pouze aktivní kurty.
-- Bez přímého SELECT grantu na public.courts PostgREST anon request skončí na RLS/privileges
-- a UI spadne do mock fallbacku s hardcoded názvy kurtů.
grant select on public.courts to anon;

drop policy if exists "courts_select_active_anon" on public.courts;

create policy "courts_select_active_anon"
  on public.courts
  for select
  to anon
  using (is_active = true);
