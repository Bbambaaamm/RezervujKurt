const PRAGUE_TZ = 'Europe/Prague';

function getZonedDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? NaN);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const zoned = getZonedDateParts(date, timeZone);
  const utcFromZonedParts = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
  return utcFromZonedParts - date.getTime();
}

function parseTimeParts(timeFrom: string) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeFrom);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? '0');

  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

function parseDateParts(reservationDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reservationDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month, day };
}

export function getPragueReservationStartMs(reservationDate: string, timeFrom: string) {
  const dateParts = parseDateParts(reservationDate);
  const timeParts = parseTimeParts(timeFrom);
  if (!dateParts || !timeParts) return Number.NaN;

  const baseUtcMs = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, timeParts.hour, timeParts.minute, timeParts.second);
  const probeDate = new Date(baseUtcMs);
  const offsetMs = getTimeZoneOffsetMs(probeDate, PRAGUE_TZ);
  return baseUtcMs - offsetMs;
}

export function isReservationStartInPast(reservationDate: string, timeFrom: string, now = new Date()) {
  const reservationStartMs = getPragueReservationStartMs(reservationDate, timeFrom);
  if (Number.isNaN(reservationStartMs)) return true;

  return reservationStartMs <= now.getTime();
}

export function getPragueTodayDate(now = new Date()) {
  const parts = getZonedDateParts(now, PRAGUE_TZ);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
