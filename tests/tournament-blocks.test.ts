import assert from 'node:assert/strict';
import test from 'node:test';

import { courts } from '../lib/mockData';
import { getTournamentBlocksForCourts, getTournamentForDateFromList, isTournamentDateBlocked, type Tournament } from '../lib/tournaments';
import { isSlotOccupiedByPublicReservations } from '../lib/services/reservation-submit-guard';

const tournament: Tournament = {
  id: 'letni-open-2026',
  title: 'Letní open turnaj ve čtyřhře',
  date: '2026-07-18',
  time: '08:30–18:00',
  courts: 'Všechny aktivní kurty',
  registration: 'Registrace u správce areálu',
  description: 'Testovací turnajová blokace.',
  accent: 'from-emerald-600 via-court to-lime-500',
  blockFromHour: 8.5,
  blockToHour: 18,
};

const tournaments = [tournament];

test('turnajový den má blokace pro všechny kurty', () => {
  const selectedTournament = getTournamentForDateFromList(tournaments, '2026-07-18');
  const blocks = getTournamentBlocksForCourts(selectedTournament, courts);

  assert.equal(isTournamentDateBlocked('2026-07-18', tournaments), true);
  assert.equal(blocks.length, courts.length);
  assert.deepEqual(blocks.map((block) => block.courtId).sort(), courts.map((court) => court.id).sort());
  assert.equal(blocks.every((block) => block.status === 'blokace'), true);
});

test('turnajová blokace zastaví běžný submit na zablokovaném dni', () => {
  const blocks = getTournamentBlocksForCourts(tournament, courts);

  assert.equal(isSlotOccupiedByPublicReservations({
    reservations: blocks,
    courtId: 1,
    date: '2026-07-18',
    timeFrom: '09:00',
    timeTo: '10:00',
  }), true);
});
