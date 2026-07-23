import { NextRequest, NextResponse } from 'next/server';
import {
  extractBearerToken,
  handleAuthenticatedCreateGoPayPaymentRequest,
  PaymentRouteAuthenticationError,
  verifySupabaseAccessToken,
} from '../../../../../lib/services/gopay-create-route-core';
import { requireGoPayCreateEnabledFromDatabase } from '../../../../../lib/services/payment-flags';

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request.headers.get('authorization'));

  if (!token) {
    return NextResponse.json({ error: 'Pro vytvoření platební rezervace je nutné přihlášení.' }, { status: 401 });
  }

  let authenticatedUser;

  try {
    authenticatedUser = await verifySupabaseAccessToken(token);
  } catch (error) {
    if (error instanceof PaymentRouteAuthenticationError) {
      return NextResponse.json({ error: 'Přihlášení pro platební rezervaci není platné.' }, { status: 401 });
    }

    console.error('GoPay create endpoint selhal bezpečně fail-closed.', { error });
    return NextResponse.json({ error: 'Platební flow je dočasně nedostupné.' }, { status: 503 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Neplatné JSON tělo požadavku.' }, { status: 400 });
  }

  const response = await handleAuthenticatedCreateGoPayPaymentRequest(
    { authenticatedUser, body },
    {
      requireGoPayCreateEnabled: requireGoPayCreateEnabledFromDatabase,
      reportUnexpectedError: (error) => console.error('GoPay create endpoint selhal bezpečně fail-closed.', { error }),
    },
  );

  return NextResponse.json(response.body, { status: response.status });
}
