import { NextRequest, NextResponse } from 'next/server';
import { buildOtpPayload, buildSupabaseOtpEndpoint, getSupabaseOtpRequestConfig, isValidOtpEmail } from '@/lib/supabase/otp-proxy';
import { resolveOtpRouteRedirectTo } from '@/lib/supabase/otp-route-payload';

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

  const redirectTo = resolveOtpRouteRedirectTo(payload);
  const supabasePayload = buildOtpPayload(email, redirectTo, { createUser: false });

  try {
    const { endpoint, headers } = getSupabaseOtpRequestConfig();
    const otpEndpoint = buildSupabaseOtpEndpoint(endpoint, supabasePayload.redirect_to);

    if (process.env.NODE_ENV === 'development') {
      console.info('[auth] otp proxy redirect_to:', {
        redirect_to: supabasePayload.redirect_to ?? null,
      });
    }

    if (process.env.NODE_ENV === 'development') {
      console.info('[auth] otp proxy supabase payload:', supabasePayload);
    }

    const response = await fetch(otpEndpoint, {
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
