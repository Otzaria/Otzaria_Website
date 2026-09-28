// אוצר-המילים של חוזה-העמוד (גרסה 1) — הגהת עמודים מתוכנת-הספר של פרויקט
// ה-OCR (docs/37-חוזה-העמוד.md בחבילה שנמסרה). המקור בצד שלהם:
// core/page/streams.py (STREAMS), core/page/pagemodel.py (PARA_STYLES,
// CHAR_STYLES, PAGE_TYPES), lab2/ops.py + book/fixes.py (סוגי-הפעולות).
// שינוי כאן חייב להתאים לשם — אחרת הקליטה אצלם תדחה את הפעולה.

export const CONTRACT_VERSION = 1;

// הזרמים המובנים. זרם מותאם-ספר מתחיל ב-s_ (וגם לו יש וריאנט _heading)
export const BUILTIN_STREAMS = {
  main: { he: 'ראשי', color: '#1a56db' },
  notes: { he: 'הערות', color: '#0e7f3c' },
  notes2: { he: "הערות ב'", color: '#7c3aed' },
  notes3: { he: "הערות ג'", color: '#b45309' },
  margin: { he: 'שוליים', color: '#c2410c' },
  sep: { he: 'מפריד', color: '#9ca3af' },
  header: { he: 'כותרת עמוד', color: '#9ca3af' },
  footer: { he: 'תחתית', color: '#9ca3af' },
  main_heading: { he: 'כותרת', color: '#1a56db' },
  notes_heading: { he: 'כותרת הערות', color: '#0e7f3c' },
  notes2_heading: { he: "כותרת הערות ב'", color: '#7c3aed' },
  notes3_heading: { he: "כותרת הערות ג'", color: '#b45309' },
};

// זרמי-ריהוט: אינם תוכן ואינם נכנסים לפלט
export const FURNITURE_STREAMS = ['header', 'footer', 'sep'];

const CUSTOM_STREAM_RE = /^s_[A-Za-z0-9_]{1,40}$/;

// בדיקה תחבירית בלבד, כמו is_stream בצד שלהם
export function isStreamKey(k) {
  if (typeof k !== 'string' || !k) return false;
  if (Object.hasOwn(BUILTIN_STREAMS, k)) return true;
  const base = k.endsWith('_heading') ? k.slice(0, -'_heading'.length) : k;
  return Object.hasOwn(BUILTIN_STREAMS, base) || CUSTOM_STREAM_RE.test(base);
}

export const PARA_STYLES = {
  body: { he: 'גוף — טקסט רץ', group: 'text' },
  h1: { he: 'כותרת ראשית', group: 'head' },
  h2: { he: 'כותרת פרק', group: 'head' },
  h3: { he: 'כותרת משנה', group: 'head' },
  dh: { he: 'פסקת דיבור-המתחיל', group: 'text' },
  author: { he: 'דברי המחבר', group: 'text' },
  gloss: { he: 'הגה / הגהה', group: 'text' },
  note: { he: 'הערה', group: 'text' },
  margin_note: { he: 'הערת-שוליים בצד', group: 'text' },
  quote: { he: 'ציטוט', group: 'text' },
  list: { he: 'סעיף / פריט ממוספר', group: 'text' },
  poem: { he: 'שירה / שורות קצרות', group: 'text' },
  toc: { he: 'שורת תוכן-עניינים', group: 'text' },
  caption: { he: 'כיתוב', group: 'text' },
  running_head: { he: 'כותרת רצה', group: 'furniture' },
  page_number: { he: 'מספר עמוד', group: 'furniture' },
  catchword: { he: 'שומר דף', group: 'furniture' },
  footer_line: { he: 'שורת תחתית', group: 'furniture' },
  separator: { he: 'מפריד / עיטור', group: 'furniture' },
};

export const CHAR_STYLES = {
  b: { he: 'מודגש', sign: 'B' },
  i: { he: 'נטוי', sign: 'I' },
  spaced: { he: 'מרווח', sign: 'א ב' },
  sup: { he: 'עילי (הפניה)', sign: '²' },
  small: { he: 'קטן', sign: 'ₐ' },
  big: { he: 'מוגדל', sign: 'A' },
  heavy: { he: 'כבד', sign: 'H' },
  rashi: { he: 'כתב רש"י', sign: 'ר' },
  square: { he: 'כתב מרובע', sign: 'מ' },
  latin: { he: 'לועזית', sign: 'L' },
};

export const PAGE_TYPES = {
  regular: 'עמוד רגיל',
  title: 'שער / עמוד פתיחה',
  toc: 'תוכן עניינים / מפתח',
  blank: 'ריק',
  plate: 'לוח / איור / טבלה',
  colophon: 'קולופון',
  approbation: 'הסכמה',
};

export const SCRIPTS = {
  square: 'מרובע',
  rashi: 'רש"י',
  latin: 'לועזי',
  mixed: 'מעורב',
  nontext: 'לא-טקסט',
};

export const CERTAINTY = {
  certain: 'ודאי',
  probable: 'סביר',
  ambiguous: 'לא בטוח',
};

// מסגרת-אובייקט (טבלה/איור/לוח) — אינה קולטת שורות לזרם
export const FRAME_OBJECT_KINDS = { table: 'טבלה', figure: 'איור', plate: 'לוח' };

// סוגי-הפעולות. contract=true — בחוזה גרסה 1 ונקלטים אצלם היום.
// contract=false — הצעה (מסמך 41 §5.1/§5.3) שעוד לא נקלטת; מותרת בגרסה 1
// (צרכן ישן מתעלם מסוג לא-מוכר), ולכן נשמרת ונשלחת כמו השאר.
export const OP_KINDS = {
  stream: { he: 'זרם', ids: true, contract: true },
  para: { he: 'סגנון-פסקה', ids: true, contract: true },
  para_start: { he: 'תחילת-פסקה', ids: true, contract: true },
  script: { he: 'כתב', ids: true, contract: true },
  styles: { he: 'סגנון-תו', ids: true, contract: true },
  text: { he: 'טקסט', ids: true, contract: true },
  status: { he: 'מחיקה/שחזור', ids: true, contract: true },
  bbox: { he: 'תיבה', ids: true, contract: true },
  page_type: { he: 'סוג-עמוד', ids: false, contract: true },
  frames_set: { he: 'מסגרות', ids: false, contract: true },
  frames_auto: { he: 'מסגרות מהזיהוי', ids: false, contract: true },
  frames_clear: { he: 'ניקוי מסגרות', ids: false, contract: true },
  frame_seq: { he: 'מספר-מסגרת בזרם', ids: false, contract: true },
  link_add: { he: 'קישור ידני', ids: true, contract: true },
  link_ok: { he: 'אישור קישור', ids: false, contract: true },
  link_del: { he: 'ביטול קישור', ids: false, contract: true },
  mixed_line: { he: 'שורה מעורבת', ids: true, contract: true },
  certainty: { he: 'ודאות', ids: true, contract: true },
  line_ok: { he: 'השורה נכונה', ids: true, contract: false },
  line_split: { he: 'פיצול שורה', ids: true, contract: false },
  line_merge: { he: 'איחוד שורות', ids: true, contract: false },
  line_add: { he: 'הוספת שורה', ids: false, contract: false },
};

// צבע לזרם: מהעמוד (streams/stream_vocab), ואחרת מהמובנים, ואחרת אפור
export function streamInfo(doc, key) {
  const base = typeof key === 'string' ? key.replace(/_heading$/, '') : '';
  const fromDoc =
    (doc?.streams || []).find((s) => s.key === base) ||
    (doc?.stream_vocab || []).find((s) => s.key === base);
  const builtin = BUILTIN_STREAMS[base];
  return {
    key: base,
    heading: typeof key === 'string' && key.endsWith('_heading'),
    he: fromDoc?.he || builtin?.he || base || '—',
    color: fromDoc?.color || builtin?.color || '#888888',
  };
}

export function isFurnitureStream(key) {
  return FURNITURE_STREAMS.includes(String(key || '').replace(/_heading$/, ''));
}
