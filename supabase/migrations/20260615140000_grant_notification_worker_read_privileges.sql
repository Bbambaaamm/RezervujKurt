-- Worker načítá podklady notifikace přes PostgREST pod rolí service_role.
-- RPC funkce pro správu outboxu mají vlastní SECURITY DEFINER oprávnění,
-- proto zde stačí pouze čtení tří zdrojových tabulek.
grant select on table public.reservations to service_role;
grant select on table public.courts to service_role;
grant select on table public.profiles to service_role;
