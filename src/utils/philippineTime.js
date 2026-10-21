// Portable React/Vite + Expo policy. Stored timestamps remain UTC/offset instants.
export const PHILIPPINE_TIME_ZONE = 'Asia/Manila';
const DAY_MS = 86400000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export function parseTimestamp(value) {
  if (value == null || value === '') return null;
  if (Object.prototype.toString.call(value) === '[object Date]' || typeof value === 'number') {
    const date = new Date(typeof value === 'number' ? value : Date.prototype.getTime.call(value));
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string') return null;
  // Never guess the timezone of a legacy naive timestamp or a calendar date.
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value)) return null;
  const normalized = value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function format(value, options, fallback) {
  const date = parseTimestamp(value);
  return date ? new Intl.DateTimeFormat('en-PH', { hour12: true, ...options,
    timeZone: PHILIPPINE_TIME_ZONE }).format(date) : fallback;
}
export function formatPhilippineDateTime(value, options = {}, fallback = '\u2014') {
  return format(value, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', ...options }, fallback);
}
export function formatPhilippineDate(value, options = {}, fallback = '\u2014') {
  return format(value, { month: 'short', day: 'numeric', ...options }, fallback);
}
export function formatPhilippineTime(value, options = {}, fallback = '') {
  return format(value, { hour: 'numeric', minute: '2-digit', ...options }, fallback);
}
// Keep saved alert text stable for scan deduplication; localize its embedded
// timestamp only at presentation, including alerts saved by older clients.
export function formatPhilippineAlertMessage(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/Scan timestamp: (\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?))/gi,
    (match, timestamp) => parseTimestamp(timestamp)
      ? `Scan timestamp: ${formatPhilippineDateTime(timestamp)} PhST` : match);
}
export function manilaDateKey(value) {
  const date = parseTimestamp(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-PH', { timeZone: PHILIPPINE_TIME_ZONE,
    calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function calendarMidnight(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('Choose a valid Philippine calendar date.');
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) throw new Error('Choose a valid Philippine calendar date.');
  return date.getTime();
}
export function shiftManilaDate(dateKey, days) {
  if (!Number.isInteger(days)) throw new Error('Calendar day offset must be an integer.');
  return new Date(calendarMidnight(dateKey) + days * DAY_MS).toISOString().slice(0, 10);
}
export function manilaDayRange(dateKey) {
  // Philippine calendar days are UTC+08:00 with no DST in this application's era.
  const start = calendarMidnight(dateKey) - MANILA_OFFSET_MS;
  return { start: new Date(start).toISOString(), end: new Date(start + DAY_MS).toISOString() };
}
export function manilaReportRange(serverTime, days = 7) {
  if (!Number.isInteger(days) || days < 1) throw new Error('Invalid report period.');
  const today = manilaDateKey(serverTime);
  const firstDay = shiftManilaDate(today, 1 - days);
  return { firstDay, today, start: manilaDayRange(firstDay).start, end: manilaDayRange(today).end };
}
export function compareTimestamps(first, second, descending = false) {
  const a = parseTimestamp(first)?.getTime(), b = parseTimestamp(second)?.getTime();
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return descending ? b - a : a - b;
}
