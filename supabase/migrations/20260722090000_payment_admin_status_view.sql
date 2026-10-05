-- Bezpečný read-only provozní výřez plateb pro administrátory.
-- Privilegovaný SELECT z podkladových tabulek je uzavřen v neveřejném helperu;
-- exposed view běží jako security_invoker a každý platební pokus má vlastní řádek.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.payment_admin_statuses_rows()
returns table (
  payment_id uuid,
  reservation_id uuid,
  user_id uuid,
  court_id bigint,
  reservation_date date,
  time_from time without time zone,
  time_to time without time zone,
  reservation_status text,
  provider text,
  provider_payment_id text,
  amount_cents integer,
  currency text,
  payment_status text,
  refund_status text,
  refunded_amount_cents integer,
  provider_refund_id text,
  expires_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  refund_requested_at timestamptz,
  refunded_at timestamptz,
  attempt_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id as payment_id,
    p.reservation_id,
    r.user_id,
    r.court_id,
    r.reservation_date,
    r.time_from,
    r.time_to,
    r.status as reservation_status,
    p.provider,
    p.provider_payment_id,
    p.amount_cents,
    p.currency,
    p.status as payment_status,
    p.refund_status,
    p.refunded_amount_cents,
    p.provider_refund_id,
    p.expires_at,
    p.paid_at,
    p.failed_at,
    p.cancelled_at,
    p.refund_requested_at,
    p.refunded_at,
    p.attempt_count,
    p.created_at,
    p.updated_at
  from public.payments p
  join public.reservations r on r.id = p.reservation_id
  where exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.role = 'admin'
  );
$$;

revoke all on function private.payment_admin_statuses_rows() from public;
grant execute on function private.payment_admin_statuses_rows() to authenticated, service_role;

create or replace view public.payment_admin_statuses
with (security_invoker = true, security_barrier = true)
as
select *
from private.payment_admin_statuses_rows();

revoke all privileges on public.payment_admin_statuses from public;
revoke all privileges on public.payment_admin_statuses from anon;
revoke all privileges on public.payment_admin_statuses from authenticated;

grant select on public.payment_admin_statuses to authenticated;

comment on view public.payment_admin_statuses is
  'Read-only administrátorský přehled: každý platební pokus má vlastní řádek, nejde o latest payment agregaci. Přístup je omezený neveřejným helperem na profiles.id = auth.uid() a profiles.role = admin.';
