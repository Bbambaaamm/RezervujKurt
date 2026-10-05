-- Doplňkový security hardening ověřený na stagingu.
-- 1) Trigger helper pro payments má explicitní search_path.
-- 2) btree_gist není v exposed public schema.

create schema if not exists extensions;

create or replace function public.set_payments_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'btree_gist'
      and n.nspname = 'public'
      and e.extrelocatable
  ) then
    alter extension btree_gist set schema extensions;
  end if;
end;
$$;
