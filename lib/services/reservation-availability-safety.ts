export const RESERVATION_AVAILABILITY_LOAD_ERROR = 'Aktuální dostupnost rezervací se nepodařilo načíst. Zkuste to prosím obnovit později.';
export const RESERVATION_AVAILABILITY_PRECHECK_ERROR = 'Dostupnost termínu se nepodařilo ověřit. Zkuste to prosím znovu.';

type RuntimeEnvironment = 'development' | 'production' | 'test' | string;

export function canUseReservationMockFallback(nodeEnv: RuntimeEnvironment): boolean {
  return nodeEnv === 'development';
}

export function shouldBlockReservationSubmit(params: {
  reservationsLoadError: string | null;
  availabilityWarning: string | null;
}): boolean {
  return Boolean(params.reservationsLoadError || params.availabilityWarning);
}

export function shouldRenderReservationAvailabilityGrid(reservationsLoadError: string | null): boolean {
  return !reservationsLoadError;
}

export function getReservationAvailabilityLoadErrorMessage(): string {
  return RESERVATION_AVAILABILITY_LOAD_ERROR;
}

export function getReservationAvailabilityPrecheckErrorMessage(): string {
  return RESERVATION_AVAILABILITY_PRECHECK_ERROR;
}
