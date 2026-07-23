-- Serverový kontrakt pro atomické založení platební rezervace a interní platby.
-- Funkce záměrně nevytváří GoPay checkout; externí provider se připojí až v navazujícím kroku mimo DB transakci.

create or replace function public.create_payment_reservation(
  p_user_id uuid,
  p_court_id bigint,
  p_reservation_date date,
  p_time_from time,
  p_time_to time,
  p_note text,
  p_idempotency_key text,
  p_amount_cents integer,
  p_currency text default 'CZK',
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  reservation_id uuid,
  payment_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation_id uuid;
  v_payment_id uuid;
  v_idempotency_key text;
  v_existing_payment public.payments%rowtype;
  v_existing_reservation public.reservations%rowtype;
begin
  if p_user_id is null then
    raise exception 'user_id nesmí být prázdné' using errcode = '22023';
  end if;

  if p_court_id is null or p_court_id <= 0 then
    raise exception 'court_id není platné' using errcode = '22023';
  end if;

  if p_reservation_date is null then
    raise exception 'reservation_date nesmí být prázdné' using errcode = '22023';
  end if;

  if p_time_from is null or p_time_to is null or p_time_from >= p_time_to then
    raise exception 'Časový rozsah rezervace není platný' using errcode = '22023';
  end if;

  if p_note is not null and char_length(btrim(p_note)) > 500 then
    raise exception 'Poznámka rezervace překračuje povolenou délku' using errcode = '22023';
  end if;

  v_idempotency_key := btrim(p_idempotency_key);

  if v_idempotency_key is null or char_length(v_idempotency_key) not between 1 and 255 then
    raise exception 'idempotency_key není platný' using errcode = '22023';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amount_cents musí být kladná hodnota' using errcode = '22023';
  end if;

  if p_currency is distinct from 'CZK' then
    raise exception 'Podporovaná měna platby je pouze CZK' using errcode = '22023';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' or octet_length(p_metadata::text) > 8192 then
    raise exception 'metadata musí být JSON objekt v povolené velikosti' using errcode = '22023';
  end if;

  -- Serializuje souběžné požadavky se stejným normalizovaným idempotency_key ještě před prvním čtením.
  -- Stejná hodnota se níže ukládá do payments, takže zámek i datová integrita pracují nad jedním kontraktem.
  perform pg_advisory_xact_lock(hashtextextended(v_idempotency_key, 0));

  select *
  into v_existing_payment
  from public.payments
  where idempotency_key = v_idempotency_key
  for update;

  if found then
    select *
    into v_existing_reservation
    from public.reservations
    where id = v_existing_payment.reservation_id
    for update;

    if not found then
      raise exception 'Existující platba nemá odpovídající rezervaci' using errcode = '23503';
    end if;

    if v_existing_reservation.user_id <> p_user_id
      or v_existing_reservation.court_id <> p_court_id
      or v_existing_reservation.reservation_date <> p_reservation_date
      or v_existing_reservation.time_from <> p_time_from
      or v_existing_reservation.time_to <> p_time_to
      or v_existing_payment.amount_cents <> p_amount_cents
      or v_existing_payment.currency is distinct from p_currency
    then
      raise exception 'idempotency_key_reused_with_different_payload' using errcode = '22023';
    end if;

    if v_existing_payment.status in ('failed', 'cancelled', 'expired') then
      raise exception 'idempotency_key_reused_after_terminal_payment' using errcode = '22023';
    end if;

    reservation_id := v_existing_payment.reservation_id;
    payment_id := v_existing_payment.id;
    return next;
    return;
  end if;

  insert into public.reservations (
    user_id,
    court_id,
    reservation_date,
    time_from,
    time_to,
    status,
    note
  ) values (
    p_user_id,
    p_court_id,
    p_reservation_date,
    p_time_from,
    p_time_to,
    'waiting_for_payment',
    nullif(btrim(p_note), '')
  )
  returning id into v_reservation_id;

  insert into public.payments (
    reservation_id,
    idempotency_key,
    amount_cents,
    currency,
    status,
    metadata
  ) values (
    v_reservation_id,
    v_idempotency_key,
    p_amount_cents,
    p_currency,
    'created',
    p_metadata
  )
  returning id into v_payment_id;

  insert into public.payment_audit_log (
    payment_id,
    reservation_id,
    event_type,
    old_status,
    new_status,
    source,
    metadata
  ) values (
    v_payment_id,
    v_reservation_id,
    'payment_created',
    null,
    'created',
    'app_server',
    p_metadata
  );

  reservation_id := v_reservation_id;
  payment_id := v_payment_id;
  return next;
end;
$$;

revoke all on function public.create_payment_reservation(uuid, bigint, date, time, time, text, text, integer, text, jsonb) from public;
revoke all on function public.create_payment_reservation(uuid, bigint, date, time, time, text, text, integer, text, jsonb) from authenticated;
revoke all on function public.create_payment_reservation(uuid, bigint, date, time, time, text, text, integer, text, jsonb) from anon;
grant execute on function public.create_payment_reservation(uuid, bigint, date, time, time, text, text, integer, text, jsonb) to service_role;
