// צורת הדף — שאלות המסלול המהיר (PACKAGE.md §1, §2): סוג השאלה מהרשומה, האפשרויות שמוצגות למשתמש
// (עיוורות: בלי "אוצריא"/"דפוס", בסדר אקראי קבוע לפריט ולמשתמש), והתרגום של הבחירה ל-verdict קנוני. טהור.

import { createHmac } from 'node:crypto';
import { words, cleanText } from './common.js';

export const QUESTIONS = Object.freeze(['replace', 'print_only', 'otz_only', 'paren']);
export const CHOICES = Object.freeze(['a', 'b', 'yes', 'no', 'here', 'elsewhere', 'none', 'other', 'unclear']);
export const MAX_OTHER_TEXT = 200;

export const PROMPTS = Object.freeze({
  replace: 'מה כתוב בדפוס במקום המסומן?',
  print_only: 'האם המילים האלה נדפסות כאן?',
  otz_only: 'האם המילים האלה נדפסות כאן?',
});

const LABELS = Object.freeze({
  yes: 'כן, נדפסות כאן',
  no: 'לא נדפסות כאן',
  here: 'כן, נדפסות כאן',
  elsewhere: 'נדפסות, אבל לא כאן — בשורה או בעמוד סמוך',
  none: 'לא נדפסות בכלל',
});
const EMPTY_LABEL = '(שום דבר)';

/**
 * סוג השאלה של רשומה מהחבילה: `question` אם נשלח ותקין, אחרת נגזר מ-n/print/cls.
 * paren — מראה מקום (cls=d_paren_ref); print_only — n=0 (מילות הדפוס אינן אצלנו); otz_only — print ריק.
 */
export function questionOf(rec) {
  if (QUESTIONS.includes(rec?.question)) return rec.question;
  if (rec?.cls === 'd_paren_ref') return 'paren';
  const otz = words(rec?.otz);
  const print = words(rec?.print);
  if (rec?.n === 0 || !otz.length) return 'print_only';
  if (!print.length) return 'otz_only';
  return 'replace';
}

// השאלה כפי שהמשתמש רואה אותה: paren ← print_only/otz_only לפי הצד שאינו ריק
export function effectiveQuestion(item) {
  const q = QUESTIONS.includes(item?.question) ? item.question : questionOf(item);
  if (q !== 'paren') return q;
  return item?.n === 0 || !words(item?.otz).length ? 'print_only' : 'otz_only';
}

// הסדר של שתי הקריאות ב-replace: 0 ← a=otz, b=print; 1 ← a=print, b=otz
// HMAC עם סוד של השרת (TZURAT_ORDER_SECRET, או NEXTAUTH_SECRET) — כך הלקוח אינו יכול לחשב איזו אפשרות היא
// הדפוס. בלי סוד (פיתוח/בדיקות) — מפתח קבוע. קובץ צד-שרת בלבד (node:crypto).
const orderSecret = () => process.env.TZURAT_ORDER_SECRET || process.env.NEXTAUTH_SECRET || 'tzurat-hadaf-order';
export const replaceOrder = (itemId, userId) => createHmac('sha256', orderSecret()).update(`${String(itemId)}|${String(userId)}`).digest()[0] & 1;

const sideWords = (item, side) => words(side === 'otz' ? item?.otz : item?.print);

/** האפשרויות שמוצגות למשתמש: [{id, label, words?}] */
export function optionsFor(item, userId) {
  const q = effectiveQuestion(item);
  if (q === 'replace') {
    const sides = replaceOrder(item?._id ?? item?.id, userId) === 0 ? ['otz', 'print'] : ['print', 'otz'];
    return ['a', 'b'].map((id, k) => {
      const w = sideWords(item, sides[k]);
      return { id, label: w.join(' ') || EMPTY_LABEL, words: w };
    });
  }
  if (q === 'print_only') return ['yes', 'no'].map((id) => ({ id, label: LABELS[id] }));
  return ['here', 'elsewhere', 'none'].map((id) => ({ id, label: LABELS[id] }));
}

// המילים שבשאלה (print_only/otz_only), או null
export function focusOf(item) {
  const q = effectiveQuestion(item);
  if (q === 'print_only') return sideWords(item, 'print');
  if (q === 'otz_only') return sideWords(item, 'otz');
  return null;
}

export const allowTextFor = (item) => effectiveQuestion(item) === 'replace';
export const promptFor = (item) => PROMPTS[effectiveQuestion(item)];

/**
 * הבחירה של המשתמש ← {verdict, text} או {error} (בעברית).
 * "לא ברור" (unclear) ו"משהו אחר" (other + text) תמיד אפשריים.
 */
export function choiceToVerdict(item, userId, choice, text) {
  if (choice === 'unclear') return { verdict: 'unclear', text: null };
  if (choice === 'other') {
    const t = cleanText(text, MAX_OTHER_TEXT + 1);
    if (!t) return { error: 'יש לכתוב מה נדפס' };
    if (t.length > MAX_OTHER_TEXT) return { error: `הטקסט ארוך מדי (עד ${MAX_OTHER_TEXT} תווים)` };
    return { verdict: 'other', text: t };
  }
  const q = effectiveQuestion(item);
  if (q === 'replace') {
    if (choice !== 'a' && choice !== 'b') return { error: 'תשובה לא מוכרת' };
    const order = replaceOrder(item?._id ?? item?.id, userId);
    const aIsOtz = order === 0;
    const isOtz = choice === 'a' ? aIsOtz : !aIsOtz;
    return { verdict: isOtz ? 'otz' : 'print', text: null };
  }
  if (q === 'print_only') {
    if (choice === 'yes') return { verdict: 'print', text: null };
    if (choice === 'no' || choice === 'none') return { verdict: 'otz', text: null };
    return { error: 'תשובה לא מוכרת' };
  }
  // otz_only
  if (choice === 'here' || choice === 'yes') return { verdict: 'otz', text: null };
  if (choice === 'elsewhere') return { verdict: 'elsewhere', text: null };
  if (choice === 'none' || choice === 'no') return { verdict: 'print', text: null };
  return { error: 'תשובה לא מוכרת' };
}

/** ההפך: verdict ← מזהה האפשרות שהמשתמש היה צריך לבחור (לתרגול), או null */
export function verdictToChoice(item, userId, verdict) {
  if (verdict === 'unclear' || verdict === 'other') return verdict;
  const q = effectiveQuestion(item);
  if (q === 'replace') {
    if (verdict !== 'otz' && verdict !== 'print') return null;
    const aIsOtz = replaceOrder(item?._id ?? item?.id, userId) === 0;
    return (verdict === 'otz') === aIsOtz ? 'a' : 'b';
  }
  if (q === 'print_only') return verdict === 'print' ? 'yes' : verdict === 'otz' ? 'no' : null;
  return { otz: 'here', elsewhere: 'elsewhere', print: 'none' }[verdict] || null;
}
