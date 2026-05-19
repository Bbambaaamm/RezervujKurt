import { supabaseSelectWithAccessToken } from '@/lib/supabase/client';
import type { AuthSession } from '@/lib/supabase/auth-client';

type ProfileRow = {
  id: string;
  role: 'user' | 'admin';
};

export type CurrentUserRole = 'anonymous' | 'user' | 'admin';

export async function getCurrentUserRoleFromSession(session: AuthSession | null): Promise<CurrentUserRole> {
  if (!session?.user?.id || !session.access_token) {
    return 'anonymous';
  }

  const profileRows = await supabaseSelectWithAccessToken<ProfileRow>(
    `profiles?select=id,role&id=eq.${session.user.id}&limit=1`,
    session.access_token,
  );

  const role = profileRows[0]?.role;
  if (role === 'admin') {
    return 'admin';
  }

  return 'user';
}
