/**
 * Datumi za ponavljajuće uplatnice.
 *
 * Namjerno nema schedulera: "sljedeće dospijeće" se pomiče tek kad korisnik
 * označi uplatnicu plaćenom. Datumi su lokalni (Europe/Zagreb) i u formatu
 * YYYY-MM-DD, bez vremenske zone u bazi.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');

export const INTERVAL_UNITS = ['dan', 'tjedan', 'mjesec'];

export const UNIT_LABEL = { dan: 'dan', tjedan: 'tjedan', mjesec: 'mjesec' };

/** Date -> "YYYY-MM-DD" u lokalnoj zoni. */
function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "YYYY-MM-DD" -> Date u lokalnoj zoni (bez UTC pomaka). */
export function parseIso(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export const todayIso = () => isoDate(new Date());

/** Pomak za jedan interval, uz korektno krajenje mjeseca (31.1. + 1 mj. = 28./29.2.). */
export function addInterval(isoValue, unit, count) {
  const date = parseIso(isoValue);
  const n = Number(count);

  if (unit === 'dan') {
    date.setDate(date.getDate() + n);
    return isoDate(date);
  }
  if (unit === 'tjedan') {
    date.setDate(date.getDate() + 7 * n);
    return isoDate(date);
  }
  if (unit === 'mjesec') {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + n);
    const daysInTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, daysInTargetMonth));
    return isoDate(date);
  }
  throw new Error(`Nepoznata jedinica intervala: ${unit}`);
}

/**
 * Sljedeće dospijeće nakon uplate.
 * Uvijek pomiče barem jedan interval (plaćeni period je zatvoren), a zatim
 * preskače sve periode koji su već prošli — tako uplata zakašnjela dva mjeseca
 * ne ostavlja uplatnicu "u kašnjenju" odmah nakon plaćanja.
 */
export function advanceNextDue(nextDue, unit, count, today = todayIso()) {
  let next = addInterval(nextDue, unit, count);
  let guard = 0;
  while (next <= today) {
    next = addInterval(next, unit, count);
    if ((guard += 1) > 1000) throw new Error('Interval ne napreduje — provjeri interval_count.');
  }
  return next;
}

/** Broj dana do dospijeća; negativno = kasni. */
export function daysUntil(isoValue, today = todayIso()) {
  return Math.round((parseIso(isoValue) - parseIso(today)) / DAY_MS);
}

/** Ljudski opis dospijeća za UI. */
export function dueLabel(isoValue, today = todayIso()) {
  if (!isoValue) return 'jednokratno';
  const days = daysUntil(isoValue, today);
  if (days === 0) return 'dospijeva danas';
  if (days === 1) return 'dospijeva sutra';
  if (days > 1) return `dospijeva za ${days} dana`;
  if (days === -1) return 'kasni 1 dan';
  return `kasni ${Math.abs(days)} dana`;
}

export const isDueSoon = (isoValue, today = todayIso(), withinDays = 7) =>
  Boolean(isoValue) && daysUntil(isoValue, today) <= withinDays;

/** Prozor za dashboard: mjesečni ritam plaćanja, ne tjedni. */
export const DASHBOARD_WINDOW_DAYS = 30;

export const isOverdue = (isoValue, today = todayIso()) =>
  Boolean(isoValue) && daysUntil(isoValue, today) < 0;

/* ---------- Mjeseci ---------- */

const MJESECI = [
  'siječanj', 'veljača', 'ožujak', 'travanj', 'svibanj', 'lipanj',
  'srpanj', 'kolovoz', 'rujan', 'listopad', 'studeni', 'prosinac',
];

/** "2026-10-27" -> "2026-10" */
export const monthKey = (isoValue) => String(isoValue).slice(0, 7);

/** "2026-10" -> "2026-10-31" */
export function lastDayOfMonth(monthKeyValue) {
  const [year, month] = monthKeyValue.split('-').map(Number);
  return isoDate(new Date(year, month, 0));
}

/** "2026-10" -> "listopad 2026." */
export function monthLabel(monthKeyValue) {
  const [year, month] = monthKeyValue.split('-').map(Number);
  return `${MJESECI[month - 1]} ${year}.`;
}

/** Lokativ, za "u <mjesec>": "2026-10" -> "listopadu 2026." */
const MJESECI_LOKATIV = [
  'siječnju', 'veljači', 'ožujku', 'travnju', 'svibnju', 'lipnju',
  'srpnju', 'kolovozu', 'rujnu', 'listopadu', 'studenom', 'prosincu',
];

export function monthLabelIn(monthKeyValue) {
  const [year, month] = monthKeyValue.split('-').map(Number);
  return `${MJESECI_LOKATIV[month - 1]} ${year}.`;
}
