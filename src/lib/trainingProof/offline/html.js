// בניית קובץ ה-HTML היחיד של "אישור בלי אינטרנט" (docs/115 §3) — טהור.
// מבנה הקובץ: הראש (CSP שאוסר כל פנייה החוצה + העיצוב) ← הנתונים (JSON) ← תמונה בכל
// <script type="text/plain"> (base64) ← החלון (viewer.js). התמונות באות בנפרד כדי שהשרת ישלח
// את הקובץ בזרם, תמונה-תמונה, בלי להחזיק את כולו בזיכרון.

import { VIEWER_CSS, viewerMain } from './viewer.js';

// JSON בתוך <script>: בלי "</script>" ובלי מפרידי-שורה של JS
const LS = new RegExp(String.fromCharCode(0x2028), 'g');
const PS = new RegExp(String.fromCharCode(0x2029), 'g');
export function scriptJson(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(LS, '\\' + 'u2028')
    .replace(PS, '\\' + 'u2029');
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// אין טעינה מבחוץ: תמונות רק מתוך הקובץ (data:/blob:), סגנון וסקריפט רק בתוכו, ואף fetch
export const OFFLINE_CSP =
  "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

export function htmlHead({ title }) {
  return (
    '<!doctype html>\n<html lang="he" dir="rtl"><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${OFFLINE_CSP}">` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${esc(title)}</title><style>${VIEWER_CSS}</style></head>` +
    '<body><div id="app"><p class="loading">טוען את החומר…</p></div>\n'
  );
}

export function htmlData(data) {
  return `<script type="application/json" id="tp-data">${scriptJson(data)}</script>\n`;
}

const MIME_RE = /^image\/(webp|png|jpeg|gif)$/;

// תמונה אחת. key — [a-z0-9]; mime — רק סוגי-תמונה
export function htmlImage(key, mime, buffer) {
  if (!/^[a-z0-9]+$/i.test(key)) throw new Error('מפתח-תמונה לא תקין');
  const t = MIME_RE.test(mime) ? mime : 'image/jpeg';
  return `<script type="text/plain" data-img="${key}" data-t="${t}">${Buffer.from(buffer).toString('base64')}</script>\n`;
}

export function htmlTail() {
  return `<script>(${viewerMain.toString()})();</script>\n</body></html>\n`;
}
