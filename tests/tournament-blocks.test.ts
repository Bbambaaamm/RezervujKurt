import assert from 'node:assert/strict';
import test from 'node:test';

import { courts } from '../lib/mockData';
import { getTournamentBlocksForCourts, getTournamentForDate, isTournamentDateBlocked } from '../lib/tournaments';
import { isSlotOccupiedByPublicReservations } from '../lib/services/reservation-submit-guard';

test('turnajový den má blokace pro všechny kurty', () => {
  const tournament = getTournamentForDate('2026-07-18');
  const blocks = getTournamentBlocksForCourts(tournament, courts);

  assert.equal(isTournamentDateBlocked('2026-07-18'), true);
  assert.equal(blocks.length, courts.length);
  assert.deepEqual(blocks.map((block) => block.courtId).sort(), courts.map((court) => court.id).sort());
  assert.equal(blocks.every((block) => block.status === 'blokace'), true);
});

test('turnajová blokace zastaví běžný submit na zablokovaném dni', () => {
  const tournament = getTournamentForDate('2026-07-18');
  const blocks = getTournamentBlocksForCourts(tournament, courts);

  assert.equal(isSlotOccupiedByPublicReservations({
    reservations: blocks,
    courtId: 1,
    date: '2026-07-18',
    timeFrom: '09:00',
    timeTo: '10:00',
  }), true);
});
