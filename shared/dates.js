'use strict';

// Policy dates are calendar dates stored as "YYYY-MM-DD" strings, so time zones never shift them.
// Used by the server and bundled into the admin UI, so it must not use Node-only APIs.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_NUMBERS = { sept: 9 };
MONTHS.forEach((name, index) => {
  MONTH_NUMBERS[name.toLowerCase()] = index + 1;
  MONTH_NUMBERS[name.slice(0, 3).toLowerCase()] = index + 1;
});

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isIsoDate(value) {
  const match = ISO_DATE.exec(value || '');
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parts(iso) {
  return iso.split('-').map(Number);
}

// "2026-09-23" -> "23 September 2026"
function formatLongDate(iso) {
  if (!isIsoDate(iso)) return '';
  const [year, month, day] = parts(iso);
  return day + ' ' + MONTHS[month - 1] + ' ' + year;
}

// "2026-09-23" -> "23 Sep 2026"
function formatShortDate(iso) {
  if (!isIsoDate(iso)) return '';
  const [year, month, day] = parts(iso);
  return day + ' ' + MONTHS[month - 1].slice(0, 3) + ' ' + year;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  return toIsoDate(new Date());
}

function addDays(iso, days) {
  const [year, month, day] = parts(iso);
  return toIsoDate(new Date(Date.UTC(year, month - 1, day + days)));
}

function pad(number) {
  return (number < 10 ? '0' : '') + number;
}

function build(year, month, day) {
  const iso = year + '-' + pad(month) + '-' + pad(day);
  return isIsoDate(iso) ? iso : null;
}

function monthNumber(name) {
  return MONTH_NUMBERS[name.toLowerCase()] || 0;
}

// Reads the date styles policy generators use: "23 September 2026", "September 23, 2026",
// "23rd Sept 2026", "2026-09-23", "23/09/2026" (day first unless impossible) and "July 2025".
// Returns "YYYY-MM-DD" or null.
function parseLooseDate(text) {
  const s = String(text || '')
    .replace(/(\d)(st|nd|rd|th)\b/gi, '$1')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(s);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /\b(\d{1,2})[ .-]?([a-z]{3,9})\.?[ .-]?(\d{4})\b/i.exec(s);
  if (m && monthNumber(m[2])) return build(Number(m[3]), monthNumber(m[2]), Number(m[1]));

  m = /\b([a-z]{3,9})\.? (\d{1,2}) (\d{4})\b/i.exec(s);
  if (m && monthNumber(m[1])) return build(Number(m[3]), monthNumber(m[1]), Number(m[2]));

  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return a > 12 || b <= 12 ? build(Number(m[3]), b, a) : build(Number(m[3]), a, b);
  }

  m = /\b([a-z]{3,9})\.? (\d{4})\b/i.exec(s);
  if (m && monthNumber(m[1])) return build(Number(m[2]), monthNumber(m[1]), 1);

  return null;
}

module.exports = {
  MONTHS,
  isIsoDate,
  formatLongDate,
  formatShortDate,
  toIsoDate,
  todayIso,
  addDays,
  parseLooseDate,
};
