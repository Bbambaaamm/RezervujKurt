-- Před prvním síťovým voláním uloží worker přesný seznam e-mailů.
-- Další pokusy tak používají stejný obsah i idempotency klíče.
create or replace function public.snapshot_notification_outbox_payload(
  p_event_id bigint,
  p_worker_token uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_payload jsonb;
begin
  if jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(p_payload -> 'messages') <> 'array'
  then
    raise exception 'Payload notifikace musí obsahovat pole messages.';
  end if;

  update public.notification_outbox
  set
    payload = case
      when jsonb_typeof(payload -> 'messages') = 'array' then payload
      else p_payload
    end,
    updated_at = now()
  where id = p_event_id
    and status = 'processing'
    and lock_token = p_worker_token
  returning payload into v_payload;

  if v_payload is null then
    raise exception 'Událost už nevlastní aktuální worker.';
  end if;

  return v_payload;
end;
$$;

revoke all on function public.snapshot_notification_outbox_payload(bigint, uuid, jsonb) from public;
revoke all on function public.snapshot_notification_outbox_payload(bigint, uuid, jsonb) from anon;
revoke all on function public.snapshot_notification_outbox_payload(bigint, uuid, jsonb) from authenticated;

grant execute on function public.snapshot_notification_outbox_payload(bigint, uuid, jsonb) to service_role;
