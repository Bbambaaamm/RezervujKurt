import { getReservationSlotState } from './reservation-slot-state';
import type { Reservation } from '../types/domain';

function parseTimeToHour(timeValue: string): number {
  const [hoursRaw = '0', minutesRaw = '0'] = timeValue.split(':');
  const hours = Number.parseInt(hoursRaw, 10);
  const minutes = Number.parseInt(minutesRaw, 10);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }

  return hours + (minutes / 60);
}

export function isSlotOccupiedByPublicReservations(input: {
  reservations: Reservation[];
  courtId: number;
  date: string;
  timeFrom: string;
  timeTo: string;
}) {
  const slotState = getReservationSlotState(
    input.reservations,
    input.courtId,
    input.date,
    parseTimeToHour(input.timeFrom),
    parseTimeToHour(input.timeTo),
  );

  return slotState.isOccupied;
}
