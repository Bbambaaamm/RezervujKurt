-- Autoritativní serverový ceník pro budoucí platební rezervace.
-- Migrace nevkládá žádnou cenu, takže GoPay flow zůstává bez řízené konfigurace fail-closed.

create table public.court_payment_prices (
  court_id bigint primary key references public.courts (id) on delete restrict,
  price_per_hour_cents integer not null,
  currency text not null default 'CZK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Technický strop zaručuje, že i maximální jednodenní interval nepřeteče integer amount_cents.
  -- Nejde o produktovou cenu; nižší obchodní limit musí schválit vlastník produktu.
  constraint court_payment_prices_amount_chk check (price_per_hour_cents between 1 and 89478485),
  constraint court_payment_prices_currency_chk check (currency = 'CZK')
);

alter table public.court_payment_prices enable row level security;

revoke all privileges on public.court_payment_prices from anon, authenticated;
grant select on public.court_payment_prices to service_role;

create function public.get_court_payment_price(p_court_id bigint)
returns table (
  price_per_hour_cents integer,
  currency text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select price.price_per_hour_cents, price.currency
  from public.courts as court
  join public.court_payment_prices as price on price.court_id = court.id
  where court.id = p_court_id
    and court.is_active = true;
$$;

revoke all on function public.get_court_payment_price(bigint) from public;
revoke execute on function public.get_court_payment_price(bigint) from anon;
revoke execute on function public.get_court_payment_price(bigint) from authenticated;
grant execute on function public.get_court_payment_price(bigint) to service_role;
