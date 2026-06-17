import type { Court, Reservation } from './types/domain';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
  posterUrl?: string | null;
  note?: string | null;
};

export type TournamentFormInput = {
  title: string;
  date: string;
  timeFrom: string;
  timeTo: string;
  posterUrl?: string;
  posterFile?: File | null;
  note?: string;
};

const tournamentPosterBucket = 'tournament-posters';
const maxTournamentPosterSizeBytes = 5 * 1024 * 1024;
const allowedTournamentPosterTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

type TournamentRow = {
  id: string;
  title: string;
  event_date: string;
  time_from: string;
  time_to: string;
  poster_url: string | null;
  note: string | null;
};

export const upcomingTournaments: Tournament[] = [];

function parseHour(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) + Number(minutes) / 60;
}

function formatTimeRange(timeFrom: string, timeTo: string) {
  return `${timeFrom.slice(0, 5)}–${timeTo.slice(0, 5)}`;
}

function mapTournament(row: TournamentRow): Tournament {
  return {
    id: row.id,
    title: row.title,
    date: row.event_date,
    time: formatTimeRange(row.time_from, row.time_to),
    courts: 'Všechny aktivní kurty',
    registration: row.note?.trim() || 'Informace u správce areálu',
    description: row.note?.trim() || 'Turnajová blokace vytvořená správcem areálu. Běžné rezervace jsou v uvedeném čase blokované.',
    accent: 'from-emerald-600 via-court to-lime-500',
    blockFromHour: parseHour(row.time_from),
    blockToHour: parseHour(row.time_to),
    posterUrl: row.poster_url,
    note: row.note,
  };
}

function getTodayLocalDate() {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function requireSupabaseConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Chybí konfigurace Supabase proměnných prostředí.');
  }
}

function getPublicTournamentPosterUrl(path: string) {
  requireSupabaseConfig();
  return `${supabaseUrl}/storage/v1/object/public/${tournamentPosterBucket}/${path}`;
}

function getSafePosterFileName(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${randomPart}.${extension}`;
}

async function uploadTournamentPoster(accessToken: string, file: File): Promise<string> {
  requireSupabaseConfig();

  if (!allowedTournamentPosterTypes.has(file.type)) {
    throw new Error('Plakát musí být obrázek ve formátu JPG, PNG nebo WebP.');
  }

  if (file.size > maxTournamentPosterSizeBytes) {
    throw new Error('Plakát může mít maximálně 5 MB.');
  }

  const path = getSafePosterFileName(file);
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${tournamentPosterBucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey!,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': file.type,
      'Cache-Control': '31536000',
      'x-upsert': 'false',
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Nahrání plakátu selhalo: ${response.status} ${await response.text()}`);
  }

  return getPublicTournamentPosterUrl(path);
}

async function tournamentRequest<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  requireSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey!,
      Authorization: `Bearer ${accessToken ?? supabaseAnonKey}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Požadavek na turnaje selhal: ${response.status} ${await response.text()}`);
  }

  if (response.status === 204) return undefined as T;
  const responseBody = await response.text();
  return (responseBody ? JSON.parse(responseBody) : undefined) as T;
}

export function getTournamentForDateFromList(tournaments: Tournament[], date: string): Tournament | null {
  return tournaments.find((tournament) => tournament.date === date) ?? null;
}

export function getTournamentForDate(date: string): Tournament | null {
  return getTournamentForDateFromList(upcomingTournaments, date);
}

export function isTournamentDateBlocked(date: string, tournaments = upcomingTournaments): boolean {
  return getTournamentForDateFromList(tournaments, date) !== null;
}

export async function getUpcomingTournaments(today = getTodayLocalDate()): Promise<Tournament[]> {
  const rows = await tournamentRequest<TournamentRow[]>(
    `tournaments?select=id,title,event_date,time_from,time_to,poster_url,note&event_date=gte.${today}&order=event_date.asc,time_from.asc`,
  );

  return rows.map(mapTournament);
}

export async function getTournamentsForDate(date: string): Promise<Tournament[]> {
  const rows = await tournamentRequest<TournamentRow[]>(
    `tournaments?select=id,title,event_date,time_from,time_to,poster_url,note&event_date=eq.${date}&order=time_from.asc`,
  );

  return rows.map(mapTournament);
}

export async function getAdminTournaments(accessToken: string): Promise<Tournament[]> {
  const rows = await tournamentRequest<TournamentRow[]>(
    'tournaments?select=id,title,event_date,time_from,time_to,poster_url,note&order=event_date.desc,time_from.asc&limit=50',
    {},
    accessToken,
  );

  return rows.map(mapTournament);
}

async function normalizeTournamentPayload(input: TournamentFormInput, accessToken?: string) {
  const posterUrl = input.posterFile && accessToken ? await uploadTournamentPoster(accessToken, input.posterFile) : input.posterUrl?.trim() || null;

  return {
    title: input.title.trim(),
    event_date: input.date,
    time_from: input.timeFrom,
    time_to: input.timeTo,
    poster_url: posterUrl,
    note: input.note?.trim() || null,
  };
}

export async function createTournament(accessToken: string, input: TournamentFormInput): Promise<void> {
  await tournamentRequest('tournaments', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(await normalizeTournamentPayload(input, accessToken)),
  }, accessToken);
}

export async function updateTournament(accessToken: string, id: string, input: TournamentFormInput): Promise<void> {
  await tournamentRequest(`tournaments?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(await normalizeTournamentPayload(input, accessToken)),
  }, accessToken);
}

export async function deleteTournament(accessToken: string, id: string): Promise<void> {
  await tournamentRequest(`tournaments?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  }, accessToken);
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
    note: `Turnaj: ${tournament.title}`,
    paymentMethod: 'online_placeholder',
    createdAt: `${tournament.date}T00:00:00Z`,
  }));
}

export function getTournamentBlocksForCourtsFromList(tournaments: Tournament[], courts: Court[]): Reservation[] {
  return tournaments.flatMap((tournament) => getTournamentBlocksForCourts(tournament, courts));
}
