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

function getRestUrl(path: string) {
  if (!supabaseUrl) {
    throw new Error('Chybí NEXT_PUBLIC_SUPABASE_URL.');
  }

  return `${supabaseUrl}/rest/v1/${path}`;
}

export async function supabaseSelect<T>(path: string): Promise<T[]> {
  if (!supabaseAnonKey) {
    throw new Error('Chybí NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  const response = await fetch(getRestUrl(path), {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    cache: 'no-store',
  });

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
