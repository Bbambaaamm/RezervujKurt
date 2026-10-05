-- Bezpecnostni hardening: privilegovane helpery presunuty mimo exposed public schema,
-- verejne views pouzivaji security_invoker a trigger funkce nejsou volatelne jako verejne RPC.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
set row_security = off
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles p
    where p.id = v_uid
      and p.role = 'admin'
  );
end;
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;

alter policy courts_modify_admin
  on public.courts
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

alter policy profiles_insert_self
  on public.profiles
  with check (((select auth.uid()) = id) or (select private.is_admin()));

alter policy profiles_select_self_or_admin
  on public.profiles
  using (((select auth.uid()) = id) or (select private.is_admin()));

alter policy profiles_update_self_or_admin
  on public.profiles
  using (((select auth.uid()) = id) or (select private.is_admin()))
  with check (((select auth.uid()) = id) or (select private.is_admin()));

alter policy reservation_audit_log_insert_admin
  on public.reservation_audit_log
  with check ((select private.is_admin()));

alter policy reservation_audit_log_select_owner_or_admin
  on public.reservation_audit_log
  using (
    (select private.is_admin())
    or exists (
      select 1
      from public.reservations r
      where r.id = reservation_audit_log.reservation_id
        and r.user_id = (select auth.uid())
    )
  );

alter policy reservations_cancel_owner
  on public.reservations
  using (
    user_id = (select auth.uid())
    and status = any (array['pending'::text, 'approved'::text])
  )
  with check (
    user_id = (select auth.uid())
    and status = 'cancelled'::text
  );

alter policy reservations_delete_admin
  on public.reservations
  using ((select private.is_admin()));

alter policy reservations_insert_admin
  on public.reservations
  with check ((select private.is_admin()));

alter policy reservations_insert_owner_pending
  on public.reservations
  with check (
    user_id = (select auth.uid())
    and status = 'pending'::text
  );

alter policy reservations_select_owner_or_admin
  on public.reservations
  using (
    user_id = (select auth.uid())
    or (select private.is_admin())
  );

alter policy reservations_update_admin
  on public.reservations
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

alter policy tournaments_delete_admin
  on public.tournaments
  using ((select private.is_admin()));

alter policy tournaments_insert_admin
  on public.tournaments
  with check ((select private.is_admin()));

alter policy tournaments_update_admin
  on public.tournaments
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

alter policy tournament_posters_insert_admin
  on storage.objects
  with check (
    bucket_id = 'tournament-posters'
    and (select private.is_admin())
  );

create or replace function private.reservation_public_occupancy_rows()
returns table (
  court_id bigint,
  reservation_date date,
  time_from time without time zone,
  time_to time without time zone,
  status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.court_id,
    r.reservation_date,
    r.time_from,
    r.time_to,
    case
      when r.status = 'waiting_for_payment' then 'approved'::text
      else r.status
    end as status
  from public.reservations r
  where r.status = any (array['waiting_for_payment'::text, 'pending'::text, 'approved'::text]);
$$;

revoke all on function private.reservation_public_occupancy_rows() from public;
grant execute on function private.reservation_public_occupancy_rows() to anon, authenticated, service_role;

create or replace function private.reservation_member_occupancy_notes_rows()
returns table (
  court_id bigint,
  reservation_date date,
  time_from time without time zone,
  time_to time without time zone,
  status text,
  note text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.court_id,
    r.reservation_date,
    r.time_from,
    r.time_to,
    r.status,
    r.note
  from public.reservations r
  where r.status = any (array['waiting_for_payment'::text, 'pending'::text, 'approved'::text])
    and (
      r.user_id = auth.uid()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = any (array['member'::text, 'admin'::text])
      )
    );
$$;

revoke all on function private.reservation_member_occupancy_notes_rows() from public;
grant execute on function private.reservation_member_occupancy_notes_rows() to authenticated, service_role;

create or replace view public.reservation_public_occupancy
with (security_invoker = true)
as
select * from private.reservation_public_occupancy_rows();

create or replace view public.reservation_member_occupancy_notes
with (security_invoker = true)
as
select * from private.reservation_member_occupancy_notes_rows();

do $$
begin
  if to_regclass('public.payments') is not null
     and to_regclass('public.payment_user_statuses') is not null
     and to_regclass('public.payment_admin_statuses') is not null then

    execute $fn$
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
      as $body$
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
                  when p.status = any (array['created'::text, 'awaiting_payment'::text, 'paid'::text, 'requires_manual_review'::text]) then 0
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
      $body$
    $fn$;

    execute 'revoke all on function private.payment_user_statuses_rows() from public';
    execute 'grant execute on function private.payment_user_statuses_rows() to authenticated, service_role';
    execute 'create or replace view public.payment_user_statuses with (security_invoker = true) as select * from private.payment_user_statuses_rows()';

    execute $fn$
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
      as $body$
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
      $body$
    $fn$;

    execute 'revoke all on function private.payment_admin_statuses_rows() from public';
    execute 'grant execute on function private.payment_admin_statuses_rows() to authenticated, service_role';
    execute 'create or replace view public.payment_admin_statuses with (security_invoker = true) as select * from private.payment_admin_statuses_rows()';
  end if;
end;
$$;

revoke execute on function public.enqueue_reservation_approved_notification() from public, anon, authenticated;
revoke execute on function public.enqueue_reservation_created_notification() from public, anon, authenticated;
revoke execute on function public.handle_new_user_profile() from public, anon, authenticated;
revoke execute on function public.log_reservation_create_audit() from public, anon, authenticated;
revoke execute on function public.log_reservation_update_audit() from public, anon, authenticated;

revoke execute on function public.is_admin() from public, anon, authenticated;
drop function public.is_admin();
