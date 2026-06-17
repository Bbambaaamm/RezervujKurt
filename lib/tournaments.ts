import type { Court, Reservation } from './types/domain';

export type Tournament = {
  id: string;
  title: string;
  date: string;
  time: string;
  courts: string;
  registration: string;
  description: string;
  accent: string;
  blockFromHour: number;
  blockToHour: number;
};

export const upcomingTournaments: Tournament[] = [
  {
    id: 'letni-open-2026',
    title: 'Letní open turnaj ve čtyřhře',
    date: '2026-07-18',
    time: '8:30–18:00',
    courts: 'Všechny 3 kurty',
    registration: 'Registrace u správce areálu do 12. 7. 2026',
    description: 'Přátelský turnaj pro členy i veřejnost. Během turnaje nebude možné vytvářet běžné hodinové rezervace.',
    accent: 'from-emerald-600 via-court to-lime-500',
    blockFromHour: 7,
    blockToHour: 21,
  },
];

export function getTournamentForDate(date: string): Tournament | null {
  return upcomingTournaments.find((tournament) => tournament.date === date) ?? null;
}

export function isTournamentDateBlocked(date: string): boolean {
  return getTournamentForDate(date) !== null;
}

export function getTournamentBlocksForCourts(tournament: Tournament | null, courts: Court[]): Reservation[] {
  if (!tournament) return [];

  return courts.map((court) => ({
    id: `turnaj-${tournament.id}-kurt-${court.id}`,
    courtId: court.id,
    date: tournament.date,
    fromHour: tournament.blockFromHour,
    toHour: tournament.blockToHour,
    status: 'blokace',
    userType: 'admin',
    name: 'Správce areálu',
    email: 'admin@banikstribro.cz',
    phone: '',
    note: tournament.title,
    paymentMethod: 'online_placeholder',
    createdAt: `${tournament.date}T00:00:00Z`,
  }));
}
