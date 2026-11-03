// צורת הדף — עזרים טהורים משותפים (בלי DB ובלי DOM): מזהים, תבניות, גיבוב דטרמיניסטי ותוויות.
// ייבוא יחסי עם `.js` בלבד — הקבצים בתיקייה רצים גם ב-node:test.

export const SLUG_RE = /^[a-z0-9-]{1,40}$/;
export const DAFKEY_RE = /^\d{3}[ab]$/;
export const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isObjectId = (v) => typeof v === 'string' && OBJECT_ID_RE.test(v);

// FNV-1a של 32 ביט — דטרמיניסטי ויציב בין תהליכים (סדר אפשרויות, דגימת עמודים כפולים)
export function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// המזהה שיוצא בייצוא (`who`): יציב, לא שם
export const whoOf = (userId) => `otz-${String(userId)}`;

// שמות הגושים לתצוגה. kind שאינו מוכר — "שוליים" (מפרשים בשולי הדף)
export const KIND_LABELS = Object.freeze({
  g: 'גמרא',
  r: 'רש"י',
  t: 'תוספות',
  mg: 'גיליון הש"ס',
  em: 'עין משפט',
  ms: 'מסורת הש"ס',
  hb: 'הגהות הב"ח',
  rh: 'רבינו חננאל',
});
export const kindLabel = (kind) => KIND_LABELS[kind] || 'שוליים';


// מערך מחרוזות נקי (מילים): רק מחרוזות לא ריקות, עד max
export function words(v, max = 200) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const w of v) {
    if (typeof w === 'string' && w.trim()) out.push(w.trim().slice(0, 100));
    if (out.length >= max) break;
  }
  return out;
}

// טקסט חופשי קצר: תווי בקרה ← רווח, רווחים מכווצים, חיתוך
export function cleanText(v, max = 2000) {
  if (typeof v !== 'string') return '';
  return Array.from(v, (ch) => {
    const c = ch.charCodeAt(0);
    return c < 32 || c === 127 ? ' ' : ch;
  })
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max);
}

// טקסט רב-שורות (דיווח, הערה): שומר שורות חדשות
export function cleanMultiline(v, max = 4000) {
  if (typeof v !== 'string') return '';
  return Array.from(v, (ch) => {
    const c = ch.charCodeAt(0);
    return (c < 32 && c !== 10) || c === 127 ? ' ' : ch;
  })
    .join('')
    .replace(/\r/g, '')
    .trim()
    .slice(0, max);
}

// שבר 0–1 תקין
export const isFrac = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

// תיבה {x,y,w,h} בשברים, או null
export function fracBox(b) {
  if (!isObj(b)) return null;
  const { x, y, w, h } = b;
  if (![x, y, w, h].every(isFrac)) return null;
  if (w <= 0 || h <= 0 || x + w > 1.000001 || y + h > 1.000001) return null;
  return { x, y, w, h };
}

// דגימת עמודים כפולים: 10% מהעמודים, דטרמיניסטי לפי slug|dafKey
export const DOUBLE_PERCENT = 10;
export const requiredFor = (slug, dafKey) => (fnv1a(`${slug}|${dafKey}`) % 100 < DOUBLE_PERCENT ? 2 : 1);
