// תאריך עברי וזמן-יחסי לכרטיסי רשת-העמודים — הפונקציות של דף הספר הישן
// (src/app/library/books/[path]/page.jsx) כמודול טהור, עם טסטים.
// הדף הישן עדיין מחזיק עותק משלו (לא נגענו בו); הפלט כאן זהה לשלו לכל קלט
// מעשי (ימים 1–30, שנים כמו תשפ"ו), כך שאפשר להעביר אותו לכאן בלי שינוי נראה.
// ההבדל היחיד: 15/16 בתוך מספר גדול (למשל 115) נכתבים ט"ו/ט"ז ולא י"ה/י"ו.
//
// שימו לב: src/lib/hebrewDate.ts הוא מודול אחר (חנות התוספים) בתבנית אחרת
// ("י"ח תשרי ה'תשפ"ז"); כאן — התבנית של דף הספר הישן ("י"ח בתשרי תשפ"ז").
// השם השונה בכוונה: הקובץ src/lib/hebrewDate.js היה מתנגש איתו בפתרון-המודולים.

const LETTERS = [
  [400, 'ת'],
  [300, 'ש'],
  [200, 'ר'],
  [100, 'ק'],
  [90, 'צ'],
  [80, 'פ'],
  [70, 'ע'],
  [60, 'ס'],
  [50, 'נ'],
  [40, 'מ'],
  [30, 'ל'],
  [20, 'כ'],
  [10, 'י'],
  [9, 'ט'],
  [8, 'ח'],
  [7, 'ז'],
  [6, 'ו'],
  [5, 'ה'],
  [4, 'ד'],
  [3, 'ג'],
  [2, 'ב'],
  [1, 'א'],
];

const DAY_MS = 24 * 60 * 60 * 1000;

// מספר ← אותיות עם גרשיים (786 ← תשפ"ו, 18 ← י"ח, 5 ← ה'). לא מספר חיובי ← ''.
export function toGematria(num) {
  let n = Math.floor(Number(num));
  if (!Number.isFinite(n) || n <= 0) return '';
  let letters = '';
  while (n >= 100) {
    const [val, ch] = LETTERS.find(([v]) => v <= n);
    letters += ch;
    n -= val;
  }
  // י"ה/י"ו אינם נכתבים — ט"ו/ט"ז
  if (n === 15) {
    letters += 'טו';
    n = 0;
  } else if (n === 16) {
    letters += 'טז';
    n = 0;
  }
  for (const [val, ch] of LETTERS) {
    while (n >= val) {
      letters += ch;
      n -= val;
    }
  }
  return letters.length > 1 ? `${letters.slice(0, -1)}"${letters.slice(-1)}` : `${letters}'`;
}

const toDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// תאריך ← "י"ח בתשרי תשפ"ז" (לפי אזור-הזמן של הדפדפן). קלט לא תקין ← ''.
export function formatHebrewDate(value) {
  const date = toDate(value);
  if (!date) return '';
  try {
    const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew-nu-latn', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).formatToParts(date);
    const day = parts.find((p) => p.type === 'day');
    const month = parts.find((p) => p.type === 'month');
    const year = parts.find((p) => p.type === 'year');
    if (!day || !month || !year) return '';
    return `${toGematria(parseInt(day.value, 10))} ב${month.value} ${toGematria(parseInt(year.value, 10) % 1000)}`;
  } catch {
    return '';
  }
}

// כמה זמן עבר — כמו בדף הישן: "היום" / "אתמול" / "לפני N ימים" (ימים שלמים)
export function formatTimeAgo(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return '';
  const days = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  return `לפני ${days} ימים`;
}

// עד מתי (מועד עתידי, למשל סוף התפיסה של עמוד) לפי שעון הדפדפן: "היום ב-14:05",
// "מחר ב-09:30", ובהמשך "יום ה' 2.10 ב-14:05". מועד שעבר (או קלט לא תקין) ← ''.
const WEEKDAY = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const pad2 = (n) => String(n).padStart(2, '0');
export function formatUntil(value, now = new Date()) {
  const date = toDate(value);
  if (!date || date.getTime() <= now.getTime()) return '';
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  // הפרש בימים-קלנדריים (מקומיים; עמיד למעבר שעון-קיץ)
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS
  );
  if (days === 0) return `היום ב-${time}`;
  if (days === 1) return `מחר ב-${time}`;
  return `יום ${WEEKDAY[date.getDay()]}' ${date.getDate()}.${date.getMonth() + 1} ב-${time}`;
}

// כמה זמן נשאר עד מועד עתידי (למשל סוף ההחכרה של עמוד): "עוד 5 שעות".
// מועד שעבר (או קלט לא תקין) ← ''.
export function formatTimeLeft(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return '';
  const ms = date.getTime() - now.getTime();
  if (ms <= 0) return '';
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return minutes === 1 ? 'עוד דקה' : `עוד ${minutes} דקות`;
  const hours = Math.floor(ms / 3600000);
  if (hours < 48) {
    if (hours === 1) return 'עוד שעה';
    if (hours === 2) return 'עוד שעתיים';
    return `עוד ${hours} שעות`;
  }
  return `עוד ${Math.floor(ms / DAY_MS)} ימים`;
}
