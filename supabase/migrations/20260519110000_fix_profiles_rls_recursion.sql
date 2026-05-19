-- Oprava rekurzivního RLS na public.profiles přes public.is_admin().
-- Původní implementace četla public.profiles pod RLS, což při SELECT profile znovu
-- vyhodnocovalo profiles policy a vedlo k stack depth limit exceeded.

create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
set row_security = off
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();

  if v_uid is null then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles p
    where p.id = v_uid
      and p.role = 'admin'
  );
end;
$$;
