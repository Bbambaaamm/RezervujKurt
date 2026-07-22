-- Bezpečný uživatelský výřez vlastních plateb pro budoucí UI po návratu z GoPay.
-- View je aditivní a nezpřístupňuje GoPay identifikátory, idempotenci ani interní technické údaje.

create or replace view public.payment_user_statuses
with (security_invoker = false, security_barrier = true)
as
select
  p.reservation_id,
  p.amount_cents,
  p.currency,
  p.status,
  p.refund_status,
  p.expires_at,
  p.paid_at,
  p.refunded_at
from public.payments p
join public.reservations r on r.id = p.reservation_id
where r.user_id = auth.uid();

revoke all privileges on public.payment_user_statuses from public;
revoke all privileges on public.payment_user_statuses from anon;
revoke all privileges on public.payment_user_statuses from authenticated;

grant select on public.payment_user_statuses to authenticated;
