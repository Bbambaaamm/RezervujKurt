import { supabaseSelectWithAccessToken } from '../supabase/client';
import type { AuthSession } from '../supabase/auth-client';

type ProfileRow = {
  id: string;
  role: 'user' | 'admin';
};

export type CurrentUserRole = 'anonymous' | 'user' | 'admin';

let cachedRoleUserId: string | null = null;
let cachedRole: CurrentUserRole | null = null;
let roleLookupInFlight: Promise<CurrentUserRole> | null = null;

export function clearCurrentUserRoleCache(): void {
  cachedRoleUserId = null;
  cachedRole = null;
  roleLookupInFlight = null;
}

export async function getCurrentUserRoleFromSession(session: AuthSession | null): Promise<CurrentUserRole> {
  if (!session?.user?.id || !session.access_token) {
    clearCurrentUserRoleCache();
    return 'anonymous';
  }

  if (cachedRoleUserId === session.user.id && cachedRole) {
    return cachedRole;
  }

  if (roleLookupInFlight) {
    return roleLookupInFlight;
  }

  roleLookupInFlight = (async () => {
    const profileRows = await supabaseSelectWithAccessToken<ProfileRow>(
      `profiles?select=id,role&id=eq.${session.user.id}&limit=1`,
      session.access_token,
    );

    const role = profileRows[0]?.role;
    const resolvedRole: CurrentUserRole = role === 'admin' ? 'admin' : 'user';

    cachedRoleUserId = session.user.id;
    cachedRole = resolvedRole;

    return resolvedRole;
  })();

  try {
    return await roleLookupInFlight;
  } finally {
    roleLookupInFlight = null;
  }
}
