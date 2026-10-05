-- Bezpečný uživatelský výřez vlastních plateb pro budoucí UI po návratu z GoPay.
-- Privilegovaný SELECT z podkladových tabulek je uzavřen v neveřejném helperu;
-- exposed view běží jako security_invoker a neposkytuje přímý přístup k payments/reservations.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.payment_user_statuses_rows()
returns table (
  reservation_id uuid,
  amount_cents integer,
  currency text,
  status text,
  refund_status text,
  expires_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ranked_payments as (
    select
      p.reservation_id,
      p.amount_cents,
      p.currency,
      p.status,
      p.refund_status,
      p.expires_at,
      p.paid_at,
      p.refunded_at,
      row_number() over (
        partition by p.reservation_id
        order by
          case
            when p.status in ('created', 'awaiting_payment', 'paid', 'requires_manual_review') then 0
            else 1
          end,
          p.updated_at desc,
          p.created_at desc,
          p.id desc
      ) as payment_rank
    from public.payments p
  )
  select
    rp.reservation_id,
    rp.amount_cents,
    rp.currency,
    rp.status,
    rp.refund_status,
    rp.expires_at,
    rp.paid_at,
    rp.refunded_at
  from ranked_payments rp
  join public.reservations r on r.id = rp.reservation_id
  where r.user_id = auth.uid()
    and rp.payment_rank = 1;
$$;

revoke all on function private.payment_user_statuses_rows() from public;
grant execute on function private.payment_user_statuses_rows() to authenticated, service_role;

create or replace view public.payment_user_statuses
with (security_invoker = true, security_barrier = true)
as
select *
from private.payment_user_statuses_rows();

revoke all privileges on public.payment_user_statuses from public;
revoke all privileges on public.payment_user_statuses from anon;
revoke all privileges on public.payment_user_statuses from authenticated;

grant select on public.payment_user_statuses to authenticated;
