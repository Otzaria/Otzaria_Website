// בדיקת סימון של מתנדב (או תיקון של מנהל, ה-11) לפני שמירה — טהור.
// מקבל את payload של הפריט (מה שהגיע מהתחנה) ואת גוף הבקשה, ומחזיר
// {result} מנורמל — בדיוק מה שנשמר ב-TrainingProofItem.result ויוצא בקובץ-ההחזרה —
// או {error} בעברית. frames נבדק בסשן הגלאי (אותה צורה: checkFramesMark).

import { OCR_ACTIONS, LINE_SCRIPTS, WORD_SCRIPTS, validBox } from './vocab.js';

const MAX_TEXT = 4000;
const MAX_WORDS = 400;

// נרמול טקסט-שורה: NFC, רווחים כפולים ורווחי-קצה. לא נוגעים בניקוד ובטעמים
export function normalizeLineText(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[\t ]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// ocr: {action, text?}. "תקן" עם טקסט זהה לזה של המודל = "נכון"
export function checkOcrMark(payload, body) {
  const action = body?.action;
  if (!OCR_ACTIONS.includes(action)) return { error: 'פעולה לא מוכרת' };
  if (action !== 'fixed') return { result: { action } };
  if (typeof body.text !== 'string') return { error: 'חסר הטקסט המתוקן' };
  const text = normalizeLineText(body.text);
  if (!text) return { error: 'הטקסט המתוקן ריק — אם השורה לא קריאה, סמנו "לא קריא"' };
  if (text.length > MAX_TEXT) return { error: 'הטקסט ארוך מדי' };
  if (text === normalizeLineText(payload?.text)) return { result: { action: 'ok' } };
  return { result: { action: 'fixed', text } };
}

const sameBox = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === 4 && a.every((v, i) => Math.abs(v - b[i]) < 0.5);

// router: {label, bad?, words?} או {skip: true}. bad → פסול (label ריק). words — רק ב-mixed: כל המילים לפי הסדר.
// words_src: "station" כשהתיבות זהות לאלה שהגיעו מהתחנה (אותם k ואותן תיבות), אחרת "site".
// skip = "דלג", כמו בזיהוי: markItem משחרר את השורה למאגר (notFor), ושום דבר לא נשמר ולא יוצא לתחנה (docs/76 §5.1)
export function checkRouterMark(payload, body) {
  if (body?.skip === true) return { result: { action: 'skip' } };
  if (body?.bad === true) return { result: { label: '', bad: true } };
  const label = body?.label;
  if (!LINE_SCRIPTS.includes(label)) return { error: 'כתב לא מוכר' };
  if (label !== 'mixed') return { result: { label, bad: false } };
  const words = body.words;
  if (!Array.isArray(words) || !words.length) return { error: 'בשורה מעורבת צריך לסמן כתב לכל מילה' };
  if (words.length > MAX_WORDS) return { error: 'יותר מדי מילים בשורה' };
  const w = payload?.w ?? null;
  const h = payload?.h ?? null;
  const out = [];
  const ks = new Set();
  for (const [i, wd] of words.entries()) {
    if (!wd || typeof wd !== 'object') return { error: 'מילה לא תקינה' };
    const k = Number.isInteger(wd.k) ? wd.k : i;
    if (ks.has(k)) return { error: 'מספר-מילה כפול' };
    ks.add(k);
    const box = Array.isArray(wd.box) ? wd.box.map((n) => Math.round(Number(n) * 10) / 10) : null;
    if (!validBox(box, w, h)) return { error: `התיבה של מילה ${i + 1} לא תקינה` };
    if (!WORD_SCRIPTS.includes(wd.label)) return { error: `חסר כתב למילה ${i + 1}` };
    out.push({ k, box, label: wd.label });
  }
  out.sort((a, b) => a.k - b.k);
  const src = payload?.words;
  const fromStation =
    Array.isArray(src) &&
    src.length === out.length &&
    out.every((o) => {
      const s = src.find((x) => x.k === o.k);
      return s && sameBox(s.box, o.box);
    });
  return { result: { label, bad: false, words: out, words_src: fromStation ? 'station' : 'site' } };
}

export const MARK_CHECKS = { ocr: checkOcrMark, router: checkRouterMark };

// האם המנהל שינה את מה שהמתנדב סימן — ל"שיעור ההתאמה" (docs/75: "כמה אושרו בלי שינוי")
export function sameResult(section, a, b) {
  if (!a || !b) return false;
  if (section === 'ocr') return a.action === b.action && (a.action !== 'fixed' || a.text === b.text);
  if (section === 'router') {
    if (!!a.bad !== !!b.bad || a.label !== b.label) return false;
    if (a.label !== 'mixed') return true;
    const aw = a.words || [];
    const bw = b.words || [];
    return aw.length === bw.length && aw.every((w, i) => w.label === bw[i].label && sameBox(w.box, bw[i].box));
  }
  return JSON.stringify(a) === JSON.stringify(b);
}
