import {
  buildReservationNotificationEmail,
  getRetryDecision,
  sanitizeProviderError,
  sendReservationNotificationEmails,
  type AdminRecipient,
  type NotificationOutboxEvent,
  type ReservationNotificationDetail,
} from './notification.ts';

type ReservationRow = {
  id: string;
  reservation_date: string;
  time_from: string;
  time_to: string;
  note: string | null;
  court_id: number;
  user_id: string;
};

type CourtRow = { name: string };
type ProfileRow = { full_name: string; email: string | null; phone: string | null };

type Configuration = {
  supabaseUrl: string;
  serviceRoleKey: string;
  resendApiKey: string;
  notificationFromEmail: string;
  siteUrl: string;
};

function requireConfiguration(): Configuration {
  const values = {
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    resendApiKey: Deno.env.get('RESEND_API_KEY'),
    notificationFromEmail: Deno.env.get('NOTIFICATION_FROM_EMAIL'),
    siteUrl: Deno.env.get('SITE_URL'),
  };
  const missing = [
    ['SUPABASE_URL', values.supabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', values.serviceRoleKey],
    ['RESEND_API_KEY', values.resendApiKey],
    ['NOTIFICATION_FROM_EMAIL', values.notificationFromEmail],
    ['SITE_URL', values.siteUrl],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Chybí konfigurace Edge Function: ${missing.join(', ')}`);
  }

  return values as Configuration;
}

async function supabaseRequest<T>(configuration: Configuration, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${configuration.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: configuration.serviceRoleKey,
      Authorization: `Bearer ${configuration.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase požadavek selhal (${response.status}).`);
  }

  const body = await response.text();
  return body ? JSON.parse(body) as T : undefined as T;
}

async function callRpc<T>(
  configuration: Configuration,
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  return supabaseRequest<T>(configuration, `rpc/${functionName}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function loadSingle<T>(
  configuration: Configuration,
  path: string,
  missingMessage: string,
): Promise<T> {
  const rows = await supabaseRequest<T[]>(configuration, path);
  if (rows.length !== 1) throw new Error(missingMessage);
  return rows[0];
}

async function loadReservationDetail(
  configuration: Configuration,
  reservationId: string,
): Promise<ReservationNotificationDetail> {
  const reservation = await loadSingle<ReservationRow>(
    configuration,
    `reservations?select=id,reservation_date,time_from,time_to,note,court_id,user_id&id=eq.${encodeURIComponent(reservationId)}`,
    'Rezervace pro notifikaci nebyla nalezena.',
  );
  const [court, profile] = await Promise.all([
    loadSingle<CourtRow>(
      configuration,
      `courts?select=name&id=eq.${reservation.court_id}`,
      'Kurt rezervace nebyl nalezen.',
    ),
    loadSingle<ProfileRow>(
      configuration,
      `profiles?select=full_name,email,phone&id=eq.${encodeURIComponent(reservation.user_id)}`,
      'Profil uživatele rezervace nebyl nalezen.',
    ),
  ]);

  return {
    reservationId: reservation.id,
    reservationDate: reservation.reservation_date,
    timeFrom: reservation.time_from,
    timeTo: reservation.time_to,
    note: reservation.note,
    courtName: court.name,
    userName: profile.full_name,
    userEmail: profile.email,
    userPhone: profile.phone,
  };
}

async function loadAdminRecipients(configuration: Configuration): Promise<AdminRecipient[]> {
  return supabaseRequest<AdminRecipient[]>(
    configuration,
    'profiles?select=email,admin_notifications_enabled&role=eq.admin&admin_notifications_enabled=eq.true&email=not.is.null',
  );
}

async function sendEmail(
  configuration: Configuration,
  message: ReturnType<typeof buildReservationNotificationEmail>,
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${configuration.resendApiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': message.idempotencyKey,
    },
    body: JSON.stringify({
      from: configuration.notificationFromEmail,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!response.ok) {
    throw new Error(`E-mail provider vrátil stav ${response.status}.`);
  }
}

async function processEvent(
  configuration: Configuration,
  event: NotificationOutboxEvent,
  workerToken: string,
): Promise<void> {
  try {
    if (event.event_type !== 'reservation.created') {
      throw new Error(`Nepodporovaný typ události: ${event.event_type}`);
    }

    const [detail, admins] = await Promise.all([
      loadReservationDetail(configuration, event.reservation_id),
      loadAdminRecipients(configuration),
    ]);
    await sendReservationNotificationEmails({
      detail,
      admins,
      siteUrl: configuration.siteUrl,
      sendEmail: (message) => sendEmail(configuration, message),
    });

    const completed = await callRpc<boolean>(configuration, 'complete_notification_outbox', {
      p_event_id: event.id,
      p_worker_token: workerToken,
    });
    if (!completed) throw new Error('Událost už nevlastní aktuální worker.');
  } catch (error) {
    const retry = getRetryDecision(event.attempt_count);
    await callRpc<boolean>(configuration, 'fail_notification_outbox', {
      p_event_id: event.id,
      p_worker_token: workerToken,
      p_last_error: sanitizeProviderError(error),
      p_retry_at: retry.retryAt,
      p_terminal: retry.terminal,
    });
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const configuration = requireConfiguration();
    if (request.headers.get('Authorization') !== `Bearer ${configuration.serviceRoleKey}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workerToken = crypto.randomUUID();
    const events = await callRpc<NotificationOutboxEvent[]>(configuration, 'claim_notification_outbox', {
      p_worker_token: workerToken,
      p_batch_size: 10,
      p_lease_seconds: 300,
    });

    for (const event of events) {
      await processEvent(configuration, event, workerToken);
    }

    return Response.json({ processed: events.length });
  } catch (error) {
    console.error(sanitizeProviderError(error));
    return Response.json({ error: 'Zpracování notifikačního outboxu selhalo.' }, { status: 500 });
  }
});
