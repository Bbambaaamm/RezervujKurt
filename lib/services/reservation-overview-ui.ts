import type { ReservationOverview } from '@/lib/services/read-only';

type ReservationIdentity = {
  userDisplayName: string | null;
  userEmail?: string | null;
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
