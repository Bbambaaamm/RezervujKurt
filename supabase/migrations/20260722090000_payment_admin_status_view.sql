-- Bezpečný read-only provozní výřez plateb pro administrátory.
-- View nezpřístupňuje idempotency key, interní metadata ani last_error a neposkytuje žádnou cestu k úpravě platebních stavů.
-- Kontrakt view záměrně vrací všechny platební pokusy, ne pouze jeden aktuální pokus na rezervaci.

create or replace view public.payment_admin_statuses
with (security_invoker = false, security_barrier = true)
as
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

revoke all privileges on public.payment_admin_statuses from public;
revoke all privileges on public.payment_admin_statuses from anon;
revoke all privileges on public.payment_admin_statuses from authenticated;

grant select on public.payment_admin_statuses to authenticated;

comment on view public.payment_admin_statuses is
  'Read-only administrátorský přehled: každý platební pokus má vlastní řádek, nejde o latest payment agregaci. Přístup je omezený filtrem profiles.id = auth.uid() a profiles.role = admin.';
