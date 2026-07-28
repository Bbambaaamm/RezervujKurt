import 'server-only';

const LOCAL_SUPABASE_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function normalizeSupabaseServerUrl(value: string): URL | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const isLocalhost = LOCAL_SUPABASE_HOSTNAMES.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) return null;

  if (url.username || url.password) return null;
  if (url.search || value.includes('?')) return null;
  if (url.hash || value.includes('#')) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;

  return new URL(url.origin);
}
