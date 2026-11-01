// מראה ומקשים של עורך-המסגרות — טהור.
//
// צבעי-התפקידים הם צבעי-נתונים (לא צבעי-ממשק), ולכן הם כאן ולא כטוקנים: אותה פלטה בדיוק כמו בתחנת-המסגרות
// (src/station/frames.js, ROLE_COL) ובדוגמה שאושרה, כדי שמסגרת "פירוש" תיראה אותו דבר בתחנה ובאתר.

import { FRAME_ROLES, FRAME_ROLE_LABELS, OBJECT_KINDS } from '../../../lib/trainingProof/vocab.js';

export const ROLE_COLORS = {
  body: '#2a5bd7',
  commentary: '#c2410c',
  notes: '#15803d',
  margin: '#7c3aed',
  heading: '#be123c',
  caption: '#0e7490',
  box: '#8a5a2b',
  furniture: '#6b7280',
  object: '#111827',
};

// התוויות בעורך (כמו בתחנה; "פנים" ב-vocab = "גוף הטקסט" בדוגמה)
export const ROLE_LABELS = { ...FRAME_ROLE_LABELS };

// מקשי-התפקיד 1–9, לפי הסדר של FRAME_ROLES (כמו ROLE_KEYS בתחנה)
export const ROLE_BY_KEY = Object.fromEntries(FRAME_ROLES.map((r, i) => [String(i + 1), r]));
export const KEY_OF_ROLE = Object.fromEntries(FRAME_ROLES.map((r, i) => [r, String(i + 1)]));

// הסוגים שזרם יכול לקבל — STREAM_KINDS ב-streamRoles.js

export const OBJECT_LABELS = {
  figure: 'איור',
  table: 'טבלה',
  ornament: 'עיטור',
  formula: 'נוסחה',
  handwriting: 'כתב-יד',
  other: 'אחר',
};
export const OBJECT_ORDER = OBJECT_KINDS;

// מצבי עמוד: תווית ו-tone של Badge
export const PAGE_STATE_LABELS = {
  proposed: 'הצעת המודל',
  draft: 'בעבודה',
  marked: 'סומן',
  skip: 'דולג',
  approved: 'אושר',
};
export const PAGE_STATE_TONES = { proposed: 'neutral', draft: 'warning', marked: 'success', skip: 'neutral', approved: 'info' };

// הקיצורים — לעזרה שבעורך
export const KEY_HELP = [
  ['גרירה על מקום ריק', 'מסגרת חדשה'],
  ['גרירת מסגרת', 'הזזה'],
  ['קצה או פינה', 'הגדלה והקטנה'],
  ['1–9', 'תפקיד'],
  ['Alt+1…9', 'זרם (והסוג שלו)'],
  ['Alt+↑ / Alt+↓', 'מוקדם / מאוחר יותר בסדר הקריאה'],
  ['C', 'ממשיך בעמוד הבא'],
  ['O', 'סדר הקריאה בלחיצות (כל העמוד)'],
  ['S', 'הצמדה לדיו'],
  ['Delete', 'מחיקת מסגרת'],
  ['Ctrl+Z', 'ביטול השינוי האחרון'],
  ['Enter', 'העמוד נכון'],
  ['← / →', 'העמוד הבא / הקודם'],
];
