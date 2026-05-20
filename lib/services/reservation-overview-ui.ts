import type { ReservationOverview } from '@/lib/services/read-only';

type ReservationIdentity = {
  userDisplayName: string | null;
  userEmail?: string | null;
};

export function getReservationUserLabel(reservation: ReservationIdentity) {
  if (reservation.userDisplayName) return reservation.userDisplayName;
  if (reservation.userEmail) return reservation.userEmail;
  return 'Uživatel';
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
