import type { ReservationOverview } from '@/lib/services/read-only';

type ReservationIdentity = {
  userDisplayName: string | null;
  userEmail?: string | null;
  userRole?: 'user' | 'member' | 'admin' | null;
};

function isUuidValue(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeIdentityValue(value: string | null | undefined) {
  if (!value) return null;
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  if (isUuidValue(trimmedValue)) return null;
  return trimmedValue;
}

export function getReservationUserLabel(reservation: ReservationIdentity) {
  const displayName = normalizeIdentityValue(reservation.userDisplayName);
  if (displayName) return displayName;

  const userEmail = normalizeIdentityValue(reservation.userEmail);
  if (userEmail) return userEmail;

  return 'Uživatel';
}

export function getReservationUserRoleLabel(reservation: Pick<ReservationIdentity, 'userRole'>) {
  if (reservation.userRole === 'member') return 'Člen';
  if (reservation.userRole === 'admin') return 'Administrátor';
  return 'Nečlen';
}

type QuickReservation = {
  courtId: number;
  fromHour: number;
  toHour: number;
};

function formatDurationLabel(hours: number) {
  if (hours <= 0) return '0 h';
  if (Number.isInteger(hours)) return `${hours} h`;

  return `${hours.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} h`;
}

export function getQuickReservationSummaryLabel(reservationsCount: number, totalReservedHours: number) {
  if (reservationsCount === 0) return 'Zatím volno';

  const reservationLabel = reservationsCount === 1 || (reservationsCount >= 2 && reservationsCount <= 4)
    ? `${reservationsCount} rezervace`
    : `${reservationsCount} rezervací`;

  return `${reservationLabel} · ${formatDurationLabel(totalReservedHours)}`;
}

export function getQuickReservationCourtHoursLabel(reservations: QuickReservation[], courtNamesById: Map<number, string>) {
  if (reservations.length === 0) return null;

  const reservedHoursByCourt = new Map<string, number>();

  reservations.forEach((reservation) => {
    const courtName = courtNamesById.get(reservation.courtId) ?? `Kurt #${reservation.courtId}`;
    const reservationHours = Math.max(0, reservation.toHour - reservation.fromHour);
    reservedHoursByCourt.set(courtName, (reservedHoursByCourt.get(courtName) ?? 0) + reservationHours);
  });

  return [...reservedHoursByCourt.entries()]
    .sort(([leftCourtName], [rightCourtName]) => leftCourtName.localeCompare(rightCourtName, 'cs'))
    .map(([courtName, reservedHours]) => `${courtName}: ${formatDurationLabel(reservedHours)}`)
    .join(' · ');
}

export function getReservationStatusLabel(status: ReservationOverview['status']) {
  if (status === 'approved') return 'Schváleno';
  if (status === 'cancelled') return 'Zrušeno';
  return 'Čeká na schválení';
}

export function shouldRenderEmptyState(isLoading: boolean, hasError: boolean, count: number) {
  return !isLoading && !hasError && count === 0;
}

export function shouldRenderLoadingState(isLoading: boolean) {
  return isLoading;
}

export function getAriaDisabled(isDisabled: boolean) {
  return isDisabled;
}

export function getAriaBusy(isLoading: boolean) {
  return isLoading ? 'true' : undefined;
}
