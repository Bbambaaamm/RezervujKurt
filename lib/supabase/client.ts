const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export class SupabaseRequestError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = 'SupabaseRequestError';
  }
}

export class SupabaseNetworkError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly causeError: unknown,
  ) {
    super(message);
    this.name = 'SupabaseNetworkError';
  }
}

function getRestUrl(path: string) {
  if (!supabaseUrl) {
    throw new Error('Chybí NEXT_PUBLIC_SUPABASE_URL.');
  }

  return `${supabaseUrl}/rest/v1/${path}`;
}

function logSupabaseSelectDebug(path: string, role: 'anon' | 'access_token') {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  const finalUrl = getRestUrl(path);
  console.info('supabase select request', { role, path, finalUrl });
}

export async function supabaseSelect<T>(path: string): Promise<T[]> {
  if (!supabaseAnonKey) {
    throw new Error('Chybí NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  logSupabaseSelectDebug(path, 'anon');

  const requestUrl = getRestUrl(path);
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      cache: 'no-store',
    });
  } catch (error) {
    throw new SupabaseNetworkError('Supabase SELECT selhal: network error', requestUrl, error);
  }

  if (!response.ok) {
    const responseBody = await response.text();
    throw new SupabaseRequestError(
      `Supabase SELECT selhal: ${response.status} ${response.statusText}`,
      response.url,
      response.status,
      responseBody,
    );
  }

  return (await response.json()) as T[];
}

export async function supabaseSelectWithAccessToken<T>(path: string, accessToken: string): Promise<T[]> {
  if (!supabaseAnonKey) {
    throw new Error('Chybí NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  logSupabaseSelectDebug(path, 'access_token');

  const requestUrl = getRestUrl(path);
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });
  } catch (error) {
    throw new SupabaseNetworkError('Supabase SELECT selhal: network error', requestUrl, error);
  }

  if (!response.ok) {
    const responseBody = await response.text();
    throw new SupabaseRequestError(
      `Supabase SELECT selhal: ${response.status} ${response.statusText}`,
      response.url,
      response.status,
      responseBody,
    );
  }

  return (await response.json()) as T[];
}
