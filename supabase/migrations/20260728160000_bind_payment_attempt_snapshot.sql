-- Atomický kontrakt identity platebního pokusu a jeho cenového a expiračního snapshotu.
-- Původní create_payment_reservation overloady zůstávají dostupné pro blue/green rollout.

set local lock_timeout = '5s';

alter table public.payments
  add column payment_attempt_id uuid,
  add column price_per_hour_cents integer,
  add constraint payments_attempt_snapshot_chk check (
    (payment_attempt_id is null and price_per_hour_cents is null)
    or (payment_attempt_id is not null and price_per_hour_cents > 0)
  );

create unique index payments_payment_attempt_id_uq
  on public.payments (payment_attempt_id)
  where payment_attempt_id is not null;

set local lock_timeout = '0';

create function public.create_or_get_payment_attempt(
  p_payment_attempt_id uuid,
  p_user_id uuid,
  p_court_id bigint,
  p_reservation_date date,
  p_time_from time,
  p_time_to time,
  p_note text,
  p_ttl_minutes integer,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  reservation_id uuid,
  payment_id uuid,
  attempt_created boolean,
  price_per_hour_cents integer,
  amount_cents integer,
  currency text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation_id uuid;
  v_payment_id uuid;
  v_price_per_hour_cents integer;
  v_amount_numeric numeric;
  v_amount_cents integer;
  v_advisory_lock_key bigint;
  v_now timestamptz;
  v_expires_at timestamptz;
  v_existing_payment public.payments%rowtype;
  v_existing_reservation public.reservations%rowtype;
begin
  if p_payment_attempt_id is null or p_user_id is null then
    raise exception 'Identita platebního pokusu nebo uživatele není platná' using errcode = '22023';
  end if;

  if p_court_id is null or p_court_id <= 0 or p_reservation_date is null then
    raise exception 'Rezervační slot není platný' using errcode = '22023';
  end if;

  if p_time_from is null or p_time_to is null or p_time_from >= p_time_to then
    raise exception 'Časový rozsah rezervace není platný' using errcode = '22023';
  end if;

  if extract(second from p_time_from) <> 0 or extract(second from p_time_to) <> 0 then
    raise exception 'Časový rozsah musí používat celé minuty' using errcode = '22023';
  end if;

  if p_note is not null and char_length(btrim(p_note)) > 500 then
    raise exception 'Poznámka rezervace překračuje povolenou délku' using errcode = '22023';
  end if;

  if p_ttl_minutes is null or p_ttl_minutes not between 1 and 1440 then
    raise exception 'TTL platebního pokusu není platné' using errcode = '22023';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' or octet_length(p_metadata::text) > 8192 then
    raise exception 'metadata musí být JSON objekt v povolené velikosti' using errcode = '22023';
  end if;

  -- hashtextextended vrací přímo podepsaný bigint; záporné hodnoty jsou pro
  -- advisory lock platné. Případná 64bitová kolize pouze serializuje cizí pokusy.
  v_advisory_lock_key := hashtextextended(p_payment_attempt_id::text, 0);
  perform pg_advisory_xact_lock(v_advisory_lock_key);

  select *
  into v_existing_payment
  from public.payments
  where payment_attempt_id = p_payment_attempt_id
  for update;

  if found then
    select *
    into v_existing_reservation
    from public.reservations
    where id = v_existing_payment.reservation_id
    for update;

    if not found then
      raise exception 'Existující platební pokus nemá rezervaci' using errcode = '23503';
    end if;

    -- Stejná chyba pro cizího uživatele i změněný payload neprozrazuje vlastnictví UUID.
    if v_existing_reservation.user_id <> p_user_id
      or v_existing_reservation.court_id <> p_court_id
      or v_existing_reservation.reservation_date <> p_reservation_date
      or v_existing_reservation.time_from <> p_time_from
      or v_existing_reservation.time_to <> p_time_to
      or v_existing_reservation.note is distinct from nullif(btrim(p_note), '')
    then
      raise exception 'payment_attempt_conflict' using errcode = '22023';
    end if;

    -- Zaplacený pokus zůstává idempotentně čitelný; pouze neúspěšné terminální
    -- stavy vyžadují vědomě nový paymentAttemptId.
    if v_existing_payment.status in ('failed', 'cancelled', 'expired') then
      raise exception 'payment_attempt_terminal' using errcode = '22023';
    end if;

    reservation_id := v_existing_payment.reservation_id;
    payment_id := v_existing_payment.id;
    attempt_created := false;
    price_per_hour_cents := v_existing_payment.price_per_hour_cents;
    amount_cents := v_existing_payment.amount_cents;
    currency := v_existing_payment.currency;
    expires_at := v_existing_payment.expires_at;
    return next;
    return;
  end if;

  -- Cena se čte až pro nový pokus a ve stejné transakci vznikne její neměnný snapshot.
  select cpp.price_per_hour_cents
  into v_price_per_hour_cents
  from public.court_payment_prices cpp
  join public.courts c on c.id = cpp.court_id
  where cpp.court_id = p_court_id
    and c.is_active = true;

  if not found then
    raise exception 'Cena aktivního kurtu není nakonfigurovaná' using errcode = '22023';
  end if;

  v_amount_numeric := (extract(epoch from (p_time_to - p_time_from)) / 3600) * v_price_per_hour_cents;
  if v_amount_numeric <= 0 or v_amount_numeric <> trunc(v_amount_numeric) or v_amount_numeric > 2147483647 then
    raise exception 'Cena rezervace nevychází na podporovanou částku' using errcode = '22023';
  end if;

  v_amount_cents := v_amount_numeric::integer;
  v_now := clock_timestamp();
  v_expires_at := v_now + make_interval(mins => p_ttl_minutes);

  insert into public.reservations (
    user_id, court_id, reservation_date, time_from, time_to, status, note,
    created_at, updated_at
  ) values (
    p_user_id, p_court_id, p_reservation_date, p_time_from, p_time_to,
    'waiting_for_payment', nullif(btrim(p_note), ''), v_now, v_now
  ) returning id into v_reservation_id;

  insert into public.payments (
    reservation_id, payment_attempt_id, idempotency_key, price_per_hour_cents,
    amount_cents, currency, status, expires_at, metadata, created_at, updated_at
  ) values (
    v_reservation_id, p_payment_attempt_id,
    'reservation-payment-attempt:v1:' || p_payment_attempt_id::text,
    v_price_per_hour_cents, v_amount_cents, 'CZK', 'created', v_expires_at, p_metadata,
    v_now, v_now
  ) returning id into v_payment_id;

  insert into public.payment_audit_log (
    payment_id, reservation_id, event_type, old_status, new_status, source, metadata,
    created_at
  ) values (
    v_payment_id, v_reservation_id, 'payment_created', null, 'created', 'app_server', p_metadata,
    v_now
  );

  reservation_id := v_reservation_id;
  payment_id := v_payment_id;
  attempt_created := true;
  price_per_hour_cents := v_price_per_hour_cents;
  amount_cents := v_amount_cents;
  currency := 'CZK';
  expires_at := v_expires_at;
  return next;
end;
$$;

revoke all on function public.create_or_get_payment_attempt(uuid, uuid, bigint, date, time, time, text, integer, jsonb) from public;
revoke all on function public.create_or_get_payment_attempt(uuid, uuid, bigint, date, time, time, text, integer, jsonb) from anon;
revoke all on function public.create_or_get_payment_attempt(uuid, uuid, bigint, date, time, time, text, integer, jsonb) from authenticated;
grant execute on function public.create_or_get_payment_attempt(uuid, uuid, bigint, date, time, time, text, integer, jsonb) to service_role;
