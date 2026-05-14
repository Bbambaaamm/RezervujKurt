import type { Court, Reservation } from './types/domain';

export const courts: Court[] = [
  { id: 1, name: 'Kurt 1', surface: 'antuka' },
  { id: 2, name: 'Kurt 2', surface: 'antuka' },
  { id: 3, name: 'Kurt 3', surface: 'antuka' },
];

export const openHours = { start: 7, end: 21 };

export const mockReservations: Reservation[] = [
  {
    id: 'r1', courtId: 1, date: '2026-05-14', fromHour: 9, toHour: 11, status: 'potvrzeno', userType: 'clen', name: 'Jan Novák', email: 'jan@priklad.cz', phone: '777123456', paymentMethod: 'clen_zdarma', createdAt: '2026-05-10T10:00:00Z'
  },
  {
    id: 'r2', courtId: 2, date: '2026-05-14', fromHour: 14, toHour: 16, status: 'cekajici', userType: 'host', name: 'Petr Svoboda', email: 'petr@priklad.cz', phone: '777654321', paymentMethod: 'hotove', createdAt: '2026-05-12T12:20:00Z'
  },
  {
    id: 'r3', courtId: 3, date: '2026-05-14', fromHour: 17, toHour: 19, status: 'blokace', userType: 'admin', name: 'Správce areálu', email: 'admin@banikstribro.cz', phone: '', note: 'Údržba kurtu', paymentMethod: 'online_placeholder', createdAt: '2026-05-11T08:30:00Z'
  }
];
