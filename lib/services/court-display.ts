import type { Court } from '@/lib/types/domain';

export function getReservationGridColumnLabels(courts: Court[]) {
  return courts.map((court) => court.name);
}
