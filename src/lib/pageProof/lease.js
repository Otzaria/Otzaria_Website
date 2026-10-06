// זמן-התפיסה של עמוד בהגהת-עמודים — בלי שבת וחג. לוגיקה טהורה (בלי מסד ובלי DOM),
// משותפת לתפיסה, לחידוש בפתיחה בעורך ולהחזרת עמוד למתנדב שביקש זיהוי-מחדש
// (claims.js, recutRules.claimBack).
//
// הכלל (בעל הפרויקט, 2026-10-05 — מתנדבים בפורום: "48 השעות לא מתחשבות בשבת"):
//   • עמוד שנתפס שמור למתנדב CLAIM_HOURS שעות (gridState) — אבל רק שעות שאינן בתוך
//     "חלון מנוחה" נספרות. התפיסה נגמרת ברגע שבו עברו CLAIM_HOURS שעות מחוץ לחלונות
//     מאז התפיסה (או מאז הפתיחה האחרונה בעורך). תפיסה שמתחילה בתוך חלון — הספירה
//     מתחילה בסופו.
//   • חלונות המנוחה, לפי השעון בירושלים (Asia/Jerusalem; גם בשעון-קיץ):
//       – כל שבת: מיום שישי ב-12:00 עד מוצאי-שבת ב-22:00;
//       – כל יום-טוב בארץ-ישראל: מערב-החג ב-12:00 עד סוף יום-החג ב-22:00. ימי-החג:
//         ראש השנה (א' וב' בתשרי), יום הכיפורים (י' בתשרי), סוכות (ט"ו בתשרי), שמיני
//         עצרת (כ"ב בתשרי), פסח (ט"ו וכ"א בניסן) ושבועות (ו' בסיוון).
//     חלונות שנוגעים זה בזה מתאחדים: חג ביום שישי או ביום ראשון, ושני ימי ראש השנה,
//     הם חלון אחד רצוף.
//   • השעות קבועות בכוונה, ושמרניות: הן רחבות מכניסת-השבת וצאתה בפועל (האתר עצמו נחסם
//     בשבת לפי הזמנים המדויקים — proxy.js), כך שהמתנדב תמיד מקבל לפחות את הזמן המלא.
//     חול-המועד, ימי-צום, פורים וחנוכה — ימי חול לעניין זה.
//   • את הלוח העברי מחשב Intl המובנה (לוח 'hebrew' של ICU — בכל Node ובכל דפדפן), בלי
//     ספרייה. ICU ממפה כל תאריך לועזי לתאריך העברי שמתחיל בערב שלפניו — ולכן "יום החג"
//     הוא היום הלועזי שתאריכו העברי הוא החג.

import { CLAIM_HOURS } from './gridState.js';

export const TZ = 'Asia/Jerusalem';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// שעות החלון (בשעון ירושלים): מתחיל ביום שלפני ב-12:00, נגמר ביום עצמו ב-22:00
export const REST_START_HOUR = 12;
export const REST_END_HOUR = 22;

// ימי-החג בארץ-ישראל לפי החודש העברי (השם של ICU באנגלית — 'Tishri', 'Nisan', 'Sivan')
export const YOM_TOV = Object.freeze({
  Tishri: Object.freeze([1, 2, 10, 15, 22]),
  Nisan: Object.freeze([15, 21]),
  Sivan: Object.freeze([6]),
});

// לתצוגה: מה שנאמר למתנדב ליד "48 שעות"
export const REST_NOTE = 'שבת וחג אינם נספרים';

let wallFmt = null;
let hebFmt = null;
const wallFormat = () =>
  (wallFmt ||= new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }));
const hebFormat = () => (hebFmt ||= new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', day: 'numeric', month: 'long' }));

const toMs = (v) => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : new Date(v).getTime());

// השעון בירושלים ברגע ms ← {y, m, d, h, mi, s}
function wallParts(ms) {
  const out = {};
  for (const p of wallFormat().formatToParts(ms)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return { y: out.year, m: out.month, d: out.day, h: out.hour === 24 ? 0 : out.hour, mi: out.minute, s: out.second };
}

// ההפרש בין השעון בירושלים ל-UTC ברגע ms (במילישניות)
function offsetAt(ms) {
  const w = wallParts(ms);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

// שעון-קיר בירושלים (יום לועזי + שעה) ← הרגע ב-UTC. החלונות נפתחים ונסגרים ב-12:00
// וב-22:00 — אף פעם לא בשעת מעבר-השעון (02:00), ולכן שני סבבים מספיקים
export function jerusalemTime(y, m, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = offsetAt(guess);
  const t = guess - first;
  const second = offsetAt(t);
  return second === first ? t : guess - second;
}

// התאריך העברי של יום לועזי (בצהריים — בלי תלות באזור-הזמן)
function hebrewDay(y, m, d) {
  const parts = hebFormat().formatToParts(Date.UTC(y, m - 1, d, 12));
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const month = parts.find((p) => p.type === 'month')?.value || '';
  return { day, month };
}

// בדיקה-עצמית של הלוח (פעם אחת): שמות-החודשים של ICU באנגלית ('Tishri', 'Nisan', 'Sivan') אינם חוזה —
// אם CLDR ישנה אותם, ימי-החג היו נעלמים בשקט והתפיסה הייתה מדלגת רק על שבת. לכן: תאריכים ידועים חייבים לצאת
// יום-טוב (גם בשנה מעוברת), ויום חול — לא; אחרת שגיאה רועשת
export const CALENDAR_CHECK = Object.freeze([
  [2026, 9, 12, true], // א' תשרי תשפ"ז
  [2026, 9, 21, true], // י' תשרי
  [2026, 4, 2, true], // ט"ו ניסן תשפ"ו
  [2027, 4, 28, true], // כ"א ניסן תשפ"ז (שנה מעוברת)
  [2027, 6, 11, true], // ו' סיוון תשפ"ז
  [2026, 9, 14, false], // ג' תשרי — חול
]);
let calendarOk = false;
export function checkCalendar() {
  if (calendarOk) return true;
  for (const [y, m, d, want] of CALENDAR_CHECK) {
    const h = hebrewDay(y, m, d);
    if ((YOM_TOV[h.month] || []).includes(h.day) !== want) {
      throw new Error(`lease.js: לוח-השנה העברי של Intl השתנה (${y}-${m}-${d} ← ${h.day} ${h.month}) — ימי-החג אינם מזוהים`);
    }
  }
  calendarOk = true;
  return true;
}

// היום הלועזי הוא יום-טוב בארץ-ישראל?
export function isYomTov(y, m, d) {
  checkCalendar();
  const h = hebrewDay(y, m, d);
  return (YOM_TOV[h.month] || []).includes(h.day);
}

// חלונות-המנוחה שנוגעים בטווח [from, to] (רגעים, Date או מספר) ← [[start, end]] במילישניות,
// ממוינים ומאוחדים
export function restWindows(from, to) {
  const a = toMs(from);
  const b = toMs(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return [];
  const start = wallParts(a);
  // מיום לפני תחילת הטווח (חלון שנפתח אתמול ב-12:00) ועד יום אחרי סופו
  const first = Date.UTC(start.y, start.m - 1, start.d) - DAY;
  const days = Math.ceil((b - a) / DAY) + 3;
  const raw = [];
  for (let k = 0; k <= days; k++) {
    const c = new Date(first + k * DAY);
    const y = c.getUTCFullYear();
    const m = c.getUTCMonth() + 1;
    const d = c.getUTCDate();
    if (c.getUTCDay() !== 6 && !isYomTov(y, m, d)) continue;
    const eve = new Date(first + (k - 1) * DAY);
    raw.push([
      jerusalemTime(eve.getUTCFullYear(), eve.getUTCMonth() + 1, eve.getUTCDate(), REST_START_HOUR),
      jerusalemTime(y, m, d, REST_END_HOUR),
    ]);
  }
  raw.sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const w of raw) {
    const last = out[out.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else out.push([w[0], w[1]]);
  }
  return out.filter((w) => w[1] > a && w[0] < b);
}

// הרגע בתוך חלון-מנוחה? (תחילת החלון — בפנים, סופו — בחוץ)
export function isRestTime(at) {
  const t = toMs(at);
  return restWindows(t - DAY, t + DAY).some(([s, e]) => t >= s && t < e);
}

// מתי נגמרת תפיסה שמתחילה ב-start: אחרי `hours` שעות שאינן בחלונות-המנוחה ← Date
export function leaseEnd(start = new Date(), hours = CLAIM_HOURS) {
  let t = toMs(start);
  let need = Math.max(0, Number(hours) || 0) * HOUR;
  if (!Number.isFinite(t)) throw new TypeError('leaseEnd: מועד-התחלה לא תקין');
  // בכל סבב — שבועיים קדימה; 48 שעות נגמרות תמיד בסבב הראשון, אבל הלולאה אינה נשענת
  // על זה (משך ארוך יותר — עוד סבבים)
  for (let round = 0; round < 60; round++) {
    const horizon = t + 14 * DAY;
    for (const [s, e] of restWindows(t, horizon)) {
      if (e <= t) continue;
      if (s > t) {
        const free = s - t;
        if (free >= need) return new Date(t + need);
        need -= free;
      }
      // חלון שנמשך אל מעבר לאופק — הסבב הבא מתחיל בסופו
      t = Math.max(t, e);
    }
    if (t < horizon) {
      const free = horizon - t;
      if (free >= need) return new Date(t + need);
      need -= free;
      t = horizon;
    }
  }
  return new Date(t + need);
}

// כמה מתוך הטווח [from, to] נפל בתוך חלונות-מנוחה (במילישניות) — לבדיקות ולהסבר
export function restOverlap(from, to) {
  const a = toMs(from);
  const b = toMs(to);
  return restWindows(a, b).reduce((sum, [s, e]) => sum + Math.max(0, Math.min(e, b) - Math.max(s, a)), 0);
}
