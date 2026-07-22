-- Serverový kontrakt pro bezpečnou změnu platebního stavu.
-- Funkce je určena pouze pro backend se service-role klíčem; klientské role ji nesmí volat.
-- Refund lifecycle bude řešený samostatným kontraktem, protože jde o oddělenou stavovou osu.

alter table public.payment_audit_log
  drop constraint if exists payment_audit_log_event_type_chk;

alter table public.payment_audit_log
  add constraint payment_audit_log_event_type_chk check (
    event_type in (
      'payment_created',
      'provider_payment_created',
      'payment_verification_started',
      'payment_verified',
      'payment_verification_failed',
      'payment_cancelled',
      'payment_expired',
      'refund_requested',
      'refund_processing',
      'refund_succeeded',
      'refund_failed',
      'manual_review_required',
      'reconciliation_started',
      'reconciliation_completed'
    )
  );

drop function if exists public.record_payment_state_change(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  boolean
);

create or replace function public.record_payment_state_change(
  p_payment_id uuid,
  p_new_status text,
  p_source text,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_provider_payment_id text default null,
  p_expires_at timestamptz default null,
  p_paid_at timestamptz default null,
  p_failed_at timestamptz default null,
  p_cancelled_at timestamptz default null,
  p_last_error text default null,
  p_increment_attempt_count boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_payment public.payments%rowtype;
  v_new_payment public.payments%rowtype;
  v_event_type text;
begin
  if p_payment_id is null then
    raise exception 'payment_id nesmí být prázdné' using errcode = '22023';
  end if;

  if p_new_status is null or btrim(p_new_status) = '' then
    raise exception 'new_status nesmí být prázdný' using errcode = '22023';
  end if;

  if p_source is null or btrim(p_source) = '' then
    raise exception 'source nesmí být prázdný' using errcode = '22023';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'metadata musí být JSON objekt' using errcode = '22023';
  end if;

  select *
  into v_old_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Platba % neexistuje', p_payment_id using errcode = 'P0002';
  end if;

  if p_new_status = v_old_payment.status then
    raise exception 'Platba % už je ve stavu %', p_payment_id, p_new_status using errcode = '22023';
  end if;

  if not (
    (v_old_payment.status = 'created' and p_new_status in ('awaiting_payment', 'failed', 'cancelled'))
    or (v_old_payment.status = 'awaiting_payment' and p_new_status in ('paid', 'failed', 'cancelled', 'expired'))
    or (v_old_payment.status = 'failed' and p_new_status = 'requires_manual_review')
  ) then
    raise exception 'Nepovolený přechod stavu platby z % na %', v_old_payment.status, p_new_status using errcode = '22023';
  end if;

  if p_new_status = 'awaiting_payment' and (p_provider_payment_id is null or btrim(p_provider_payment_id) = '') then
    raise exception 'Přechod na awaiting_payment vyžaduje provider_payment_id' using errcode = '22023';
  end if;

  if p_new_status = 'awaiting_payment' and p_expires_at is null then
    raise exception 'Přechod na awaiting_payment vyžaduje expires_at' using errcode = '22023';
  end if;

  if p_new_status = 'paid' and p_paid_at is null then
    raise exception 'Přechod na paid vyžaduje paid_at' using errcode = '22023';
  end if;

  if p_new_status = 'failed' and p_failed_at is null then
    raise exception 'Přechod na failed vyžaduje failed_at' using errcode = '22023';
  end if;

  if p_new_status = 'cancelled' and p_cancelled_at is null then
    raise exception 'Přechod na cancelled vyžaduje cancelled_at' using errcode = '22023';
  end if;

  if p_new_status = 'expired' and v_old_payment.expires_at is null then
    raise exception 'Přechod na expired vyžaduje již uložené expires_at' using errcode = '22023';
  end if;

  if p_new_status = 'expired' and v_old_payment.expires_at > now() then
    raise exception 'Přechod na expired je povolený až po uloženém expires_at' using errcode = '22023';
  end if;

  if p_increment_attempt_count and p_new_status <> 'awaiting_payment' then
    raise exception 'attempt_count lze navýšit pouze při přechodu na awaiting_payment' using errcode = '22023';
  end if;

  if p_new_status = 'awaiting_payment' and (
    p_paid_at is not null
    or p_failed_at is not null
    or p_cancelled_at is not null
    or p_last_error is not null
  ) then
    raise exception 'Přechod na awaiting_payment nepovoluje paid_at, failed_at, cancelled_at ani last_error' using errcode = '22023';
  end if;

  if p_new_status = 'paid' and (
    p_provider_payment_id is not null
    or p_expires_at is not null
    or p_failed_at is not null
    or p_cancelled_at is not null
    or p_last_error is not null
  ) then
    raise exception 'Přechod na paid povoluje pouze paid_at' using errcode = '22023';
  end if;

  if p_new_status = 'failed' and (
    p_provider_payment_id is not null
    or p_expires_at is not null
    or p_paid_at is not null
    or p_cancelled_at is not null
  ) then
    raise exception 'Přechod na failed povoluje pouze failed_at a volitelný last_error' using errcode = '22023';
  end if;

  if p_new_status = 'cancelled' and (
    p_provider_payment_id is not null
    or p_expires_at is not null
    or p_paid_at is not null
    or p_failed_at is not null
    or p_last_error is not null
  ) then
    raise exception 'Přechod na cancelled povoluje pouze cancelled_at' using errcode = '22023';
  end if;

  if p_new_status in ('expired', 'requires_manual_review') and (
    p_provider_payment_id is not null
    or p_expires_at is not null
    or p_paid_at is not null
    or p_failed_at is not null
    or p_cancelled_at is not null
    or p_last_error is not null
  ) then
    raise exception 'Přechod na expired nebo requires_manual_review nepovoluje změny provider údajů, časových sloupců ani last_error' using errcode = '22023';
  end if;

  v_event_type := case p_new_status
    when 'awaiting_payment' then 'provider_payment_created'
    when 'paid' then 'payment_verified'
    when 'failed' then 'payment_verification_failed'
    when 'expired' then 'payment_expired'
    when 'requires_manual_review' then 'manual_review_required'
    when 'cancelled' then 'payment_cancelled'
  end;

  update public.payments
  set
    status = p_new_status,
    provider_payment_id = case
      when p_new_status = 'awaiting_payment' then p_provider_payment_id
      else provider_payment_id
    end,
    expires_at = case
      when p_new_status = 'awaiting_payment' then p_expires_at
      else expires_at
    end,
    paid_at = case
      when p_new_status = 'paid' then p_paid_at
      else paid_at
    end,
    failed_at = case
      when p_new_status = 'failed' then p_failed_at
      else failed_at
    end,
    cancelled_at = case
      when p_new_status = 'cancelled' then p_cancelled_at
      else cancelled_at
    end,
    last_error = case
      when p_new_status = 'failed' then p_last_error
      else last_error
    end,
    attempt_count = attempt_count + case
      when p_new_status = 'awaiting_payment' and p_increment_attempt_count then 1
      else 0
    end
  where id = v_old_payment.id
  returning * into v_new_payment;

  insert into public.payment_audit_log (
    payment_id,
    reservation_id,
    event_type,
    old_status,
    new_status,
    old_refund_status,
    new_refund_status,
    reason,
    source,
    attempt_count,
    metadata
  )
  values (
    v_new_payment.id,
    v_new_payment.reservation_id,
    v_event_type,
    v_old_payment.status,
    v_new_payment.status,
    v_old_payment.refund_status,
    v_new_payment.refund_status,
    p_reason,
    p_source,
    v_new_payment.attempt_count,
    p_metadata
  );

  return v_new_payment.id;
end;
$$;

revoke all on function public.record_payment_state_change(
  uuid,
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  boolean
) from public;

revoke all on function public.record_payment_state_change(
  uuid,
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  boolean
) from anon, authenticated;

grant execute on function public.record_payment_state_change(
  uuid,
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  boolean
) to service_role;

comment on function public.record_payment_state_change(
  uuid,
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  boolean
) is
  'Serverový RPC kontrakt pro změny platebního stavu. Execute má pouze service_role; funkce povoluje jen explicitní přechody, odmítá nesouvisející parametry, odvozuje auditní event_type a nemění částku, měnu, provider, idempotency_key ani reservation_id.';
