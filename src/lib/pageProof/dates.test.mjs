import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toGematria, formatHebrewDate, formatTimeAgo, formatTimeLeft, formatUntil } from './dates.js';

// העותק שבדף הספר הישן (src/app/library/books/[path]/page.jsx) — כדי לוודא
// שהמודול המשותף נותן בדיוק אותו פלט בכל טווח שבשימוש (ימים ושנים)
function legacyToGematria(num) {
  if (num === 15) return 'ט"ו';
  if (num === 16) return 'ט"ז';
  const letters = [
    [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'],
    [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'],
    [3, 'ג'], [2, 'ב'], [1, 'א'],
  ];
  let result = '';
  let n = num;
  for (const [val, ch] of letters) {
    while (n >= val) {
      result += ch;
      n -= val;
    }
  }
  return result.length > 1 ? result.slice(0, -1) + '"' + result.slice(-1) : result + "'";
}

const NOW = new Date('2026-09-29T12:00:00Z');
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

test('גימטריה: אות אחת עם גרש, כמה אותיות עם גרשיים', () => {
  assert.equal(toGematria(1), "א'");
  assert.equal(toGematria(5), "ה'");
  assert.equal(toGematria(10), "י'");
  assert.equal(toGematria(18), 'י"ח');
  assert.equal(toGematria(29), 'כ"ט');
  assert.equal(toGematria(786), 'תשפ"ו');
  assert.equal(toGematria(787), 'תשפ"ז');
});

test('גימטריה: ט"ו/ט"ז — גם בתוך מספר גדול', () => {
  assert.equal(toGematria(15), 'ט"ו');
  assert.equal(toGematria(16), 'ט"ז');
  assert.equal(toGematria(115), 'קט"ו');
  assert.equal(toGematria(716), 'תשט"ז');
});

test('גימטריה: קלט לא תקין ← מחרוזת ריקה', () => {
  assert.equal(toGematria(0), '');
  assert.equal(toGematria(-3), '');
  assert.equal(toGematria(Number.NaN), '');
  assert.equal(toGematria(undefined), '');
});

test('גימטריה: זהה לעותק שבדף הישן בכל הימים ובשנות המאה הזו', () => {
  for (let d = 1; d <= 30; d++) assert.equal(toGematria(d), legacyToGematria(d), `יום ${d}`);
  for (let y = 700; y <= 899; y++) {
    if (y % 100 === 15 || y % 100 === 16) continue; // כאן הישן שגה (י"ה) — ראו הטסט הקודם
    assert.equal(toGematria(y), legacyToGematria(y), `שנה ${y}`);
  }
});

test('תאריך עברי מלא', () => {
  // 2026-09-29 = י"ח בתשרי תשפ"ז (בצהריים — אותו יום בכל אזור-זמן סביר)
  assert.equal(formatHebrewDate('2026-09-29T12:00:00Z'), 'י"ח בתשרי תשפ"ז');
  assert.equal(formatHebrewDate(new Date('2026-04-02T12:00:00Z')), 'ט"ו בניסן תשפ"ו');
});

test('תאריך עברי: קלט ריק או לא תקין ← מחרוזת ריקה', () => {
  assert.equal(formatHebrewDate(null), '');
  assert.equal(formatHebrewDate(''), '');
  assert.equal(formatHebrewDate('not a date'), '');
});

test('לפני כמה זמן — כמו בדף הישן', () => {
  assert.equal(formatTimeAgo(new Date(NOW.getTime() - 2 * HOUR), NOW), 'היום');
  assert.equal(formatTimeAgo(new Date(NOW.getTime() - 30 * HOUR), NOW), 'אתמול');
  assert.equal(formatTimeAgo(new Date(NOW.getTime() - 5 * DAY), NOW), 'לפני 5 ימים');
  assert.equal(formatTimeAgo(new Date(NOW.getTime() + HOUR), NOW), 'היום');
  assert.equal(formatTimeAgo('garbage', NOW), '');
});

test('כמה זמן נשאר', () => {
  assert.equal(formatTimeLeft(new Date(NOW.getTime() + 30 * 1000), NOW), 'עוד דקה');
  assert.equal(formatTimeLeft(new Date(NOW.getTime() + 20 * 60 * 1000), NOW), 'עוד 20 דקות');
  assert.equal(formatTimeLeft(new Date(NOW.getTime() + 90 * 60 * 1000), NOW), 'עוד שעה');
  assert.equal(formatTimeLeft(new Date(NOW.getTime() + 2.5 * HOUR), NOW), 'עוד שעתיים');
  assert.equal(formatTimeLeft(new Date(NOW.getTime() + 23.9 * HOUR), NOW), 'עוד 23 שעות');
  assert.equal(formatTimeLeft(new Date(NOW.getTime() + 3 * DAY), NOW), 'עוד 3 ימים');
});

test('כמה זמן נשאר: מועד שעבר או קלט לא תקין ← מחרוזת ריקה', () => {
  assert.equal(formatTimeLeft(new Date(NOW.getTime() - 1), NOW), '');
  assert.equal(formatTimeLeft(NOW, NOW), '');
  assert.equal(formatTimeLeft(null, NOW), '');
});

test('עד מתי: היום / מחר / יום בשבוע ותאריך — לפי שעון הדפדפן; עבר או קלט לא תקין ← ריק', () => {
  // שעון מקומי (כמו בדפדפן): יום ד', 30.9.2026, 10:00
  const now = new Date(2026, 8, 30, 10, 0);
  assert.equal(formatUntil(new Date(2026, 8, 30, 14, 5), now), 'היום ב-14:05');
  assert.equal(formatUntil(new Date(2026, 8, 30, 23, 59), now), 'היום ב-23:59');
  assert.equal(formatUntil(new Date(2026, 9, 1, 9, 30), now), 'מחר ב-09:30');
  assert.equal(formatUntil(new Date(2026, 9, 2, 14, 5), now), "יום ו' 2.10 ב-14:05");
  assert.equal(formatUntil(new Date(2026, 9, 6, 0, 0), now), "יום ג' 6.10 ב-00:00");
  // 48 שעות מעכשיו — יום שישי באותה שעה
  assert.equal(formatUntil(new Date(now.getTime() + 48 * 3600 * 1000), now), "יום ו' 2.10 ב-10:00");
  assert.equal(formatUntil(new Date(2026, 8, 30, 9, 59), now), '');
  assert.equal(formatUntil(now, now), '');
  assert.equal(formatUntil('not a date', now), '');
  assert.equal(formatUntil(null, now), '');
  // מחרוזת ISO (כמו מה-API)
  assert.equal(formatUntil(new Date(2026, 8, 30, 12, 0).toISOString(), now), 'היום ב-12:00');
});
