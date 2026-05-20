import type { CurrentUserRole } from './profile';

export type AdminGuardState = 'unauthorized' | 'forbidden' | 'allowed';

export function resolveAdminGuardState(userRole: CurrentUserRole): AdminGuardState {
  if (userRole === 'anonymous') return 'unauthorized';
  if (userRole === 'admin') return 'allowed';
  return 'forbidden';
}
