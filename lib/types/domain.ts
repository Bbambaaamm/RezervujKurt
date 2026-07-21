export type Court = {
  id: number;
  name: string;
  surface: 'antuka';
};

export type ReservationStatus = 'ceka_na_platbu' | 'cekajici' | 'potvrzeno' | 'zamítnuto' | 'zruseno' | 'blokace';

export type Reservation = {
  id: string;
  courtId: number;
  date: string;
  fromHour: number;
  toHour: number;
  status: ReservationStatus;
  userType: 'clen' | 'admin';
  name: string;
  email: string;
  phone: string;
  note?: string;
  paymentMethod: 'clen_zdarma' | 'hotove' | 'online_placeholder';
  createdAt: string;
};
