import { NextRequest, NextResponse } from 'next/server';
import { buildOtpPayload, getSupabaseOtpRequestConfig, isValidOtpEmail } from '@/lib/supabase/otp-proxy';

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Neplatné JSON tělo požadavku.' }, { status: 400 });
  }

  const payload = body as { email?: unknown; redirect_to?: unknown; emailRedirectTo?: unknown };
  const email = payload.email;

  if (!isValidOtpEmail(email)) {
    return NextResponse.json({ error: 'Pole email musí být validní řetězec.' }, { status: 400 });
  }

  const redirectToRaw = typeof payload.redirect_to === 'string'
    ? payload.redirect_to
    : typeof payload.emailRedirectTo === 'string'
      ? payload.emailRedirectTo
      : undefined;

  const redirectTo = redirectToRaw?.trim() || undefined;
  const supabasePayload = buildOtpPayload(email, redirectTo);

  try {
    const { endpoint, headers } = getSupabaseOtpRequestConfig();

    if (process.env.NODE_ENV === 'development') {
      console.info('[auth] OTP proxy request:', {
        endpoint,
        email_domain: email.includes('@') ? email.split('@')[1] : null,
        redirect_to: supabasePayload.redirect_to ?? null,
      });
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(supabasePayload),
    });

    const responseBody = await response.text();

    if (process.env.NODE_ENV === 'development') {
      console.info('[auth] OTP proxy response:', {
        status: response.status,
        statusText: response.statusText,
        body: responseBody || null,
      });
    }

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Síťová chyba při volání Supabase Auth OTP.' }, { status: 502 });
  }
}
