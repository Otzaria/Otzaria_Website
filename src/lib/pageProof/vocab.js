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

// בדיקה תחבירית בלבד, כמו is_stream בצד שלהם: אחד המובנים (כולל ארבעת
// זרמי-הכותרת שברשימה), או זרם-ספר s_… עם או בלי _heading. אין כותרת
// לשוליים/לריהוט (margin_heading, header_heading…) — שם הם נדחים.
export function isStreamKey(k) {
  if (typeof k !== 'string' || !k) return false;
  if (Object.hasOwn(BUILTIN_STREAMS, k)) return true;
  const base = k.endsWith('_heading') ? k.slice(0, -'_heading'.length) : k;
  return CUSTOM_STREAM_RE.test(base);
}

// כמו _keep_heading אצלם (core/page/frames.py): שורת-כותרת (…_heading) שנכנסת
// לזרם אחר — במסגרת או בבחירה ידנית — נשארת כותרת של הזרם החדש, אם יש לו
// וריאנט-כותרת (אין לשוליים ולריהוט). זרם-היעד שכבר כותרת — נשאר כמות-שהוא
// (אצלם s_x_heading היה נהיה s_x_heading_heading, כי s_ מתיר קו-תחתון).
export function keepHeading(newStream, oldStream) {
  if (typeof newStream !== 'string' || newStream.endsWith('_heading')) return newStream;
  const heading = `${newStream}_heading`;
  return typeof oldStream === 'string' && oldStream.endsWith('_heading') && isStreamKey(heading) ? heading : newStream;
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

// "לספר בלבד" (train_text = 0 בחוזה): השורה תוקנה למה שאמור להיות כתוב בספר, ולא
// למה שרואים בסריקה (טעות-דפוס, השלמת חסר, תיקון נוסח). הטקסט המתוקן נכנס לספר, אבל
// השורה אינה חומר-אימון למודל-הזיהוי — לא הנוסח המתוקן ולא מה שהמחשב קרא — אחרת הוא
// לומד "לראות" אותיות שאינן בדף. המבנה שלה (מסגרת, זרם, סגנון, פסקה, קישור) כן נלמד.
// שדה משלו בשורה, נפרד מ"ודאות" (certainty — ודאות התיוג). חסר/1 = רגיל.
export const isBookOnly = (line) => line?.train_text === 0 || isPrintDefect(line);

// הנוסח הישן של "לספר בלבד" (הכפתור "פגם בדפוס", 2026-10-01): certainty = ambiguous עם
// הסיבה הזו. אין עוד כפתור שכותב אותו — נשמר רק כדי לקרוא סימונים שכבר נעשו (טיוטות והגשות
// ישנות): מוצג ונספר כ"לספר בלבד"; הסרת "לספר בלבד" מורידה גם אותו, ושינוי-ודאות בשורה כזו
// מעביר את הסימון ל-train_text (ProofEditor). תוכנת-הספר מתרגמת אותו ל-train_text.
export const PRINT_DEFECT_WHY = 'פגם בדפוס — תוקן שלא לפי המקור';
export const isPrintDefect = (line) => line?.certainty === 'ambiguous' && String(line?.certainty_why || '').startsWith(PRINT_DEFECT_WHY);

// מסגרת-אובייקט (טבלה/איור/לוח) — אינה קולטת שורות לזרם
export const FRAME_OBJECT_KINDS = { table: 'טבלה', figure: 'איור', plate: 'לוח' };

// אוצר-מילים נוסף מצרכן שמטמיע את העורך (תוכנת-הספר: סגנונות-פסקה שהוגדרו לספר מסוים,
// ערך-ודאות נוסף וכו'). הערכים נכנסים לטבלאות שלמעלה עצמן — כך הבדיקה (ops.validateOp),
// השמות בעברית (הסרגל, רשימת-השינויים) והרשימות בלוח הפרטים רואים אותם בלי שינוי נוסף.
// רק מפתחות חדשים: מפתח מובנה לעולם אינו נדרס. האתר עצמו אינו קורא לזה — אצלו הכול כמו קודם.
// מחזיר פונקציה שמסירה בדיוק את מה שנוסף (בדיקות, החלפת ספר).
//
// v = {paraStyles: {key: {he, group?}}, charStyles: {key: {he, sign?}},
//      pageTypes: {key: he}, scripts: {key: he}, certainty: {key: he}}
// מפתח: אותיות לטיניות, ספרות וקו-תחתון (כמו מפתחות הסגנונות המותאמים בתוכנת-הספר)
const VOCAB_KEY_RE = /^[A-Za-z0-9_]{1,40}$/;
const VOCAB_GROUPS = new Set(['text', 'head', 'furniture']);

export function registerVocab(v = {}) {
  const added = [];
  const put = (table, key, value) => {
    if (typeof key !== 'string' || !VOCAB_KEY_RE.test(key) || Object.hasOwn(table, key)) return;
    table[key] = value;
    added.push([table, key]);
  };
  const he = (x, key) => (typeof x === 'string' && x.trim() ? x.trim() : key);
  for (const [k, s] of Object.entries(v?.paraStyles || {})) {
    put(PARA_STYLES, k, { he: he(s?.he, k), group: VOCAB_GROUPS.has(s?.group) ? s.group : 'text' });
  }
  for (const [k, s] of Object.entries(v?.charStyles || {})) {
    put(CHAR_STYLES, k, { he: he(s?.he, k), sign: typeof s?.sign === 'string' && s.sign ? s.sign : '✦' });
  }
  for (const [table, extra] of [
    [PAGE_TYPES, v?.pageTypes],
    [SCRIPTS, v?.scripts],
    [CERTAINTY, v?.certainty],
  ]) {
    for (const [k, name] of Object.entries(extra || {})) put(table, k, he(name, k));
  }
  return () => {
    for (const [table, key] of added.splice(0)) delete table[key];
  };
}

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
  // value = {src_line, page}: קישור שבוטל ("אין קישור") — ההכרעה הידנית יורדת, והמחשב קובע את הקישור מחדש
  link_reset: { he: 'קישור — חזרה לאוטומטי', ids: false, contract: true },
  mixed_line: { he: 'שורה מעורבת', ids: true, contract: true },
  certainty: { he: 'ודאות', ids: true, contract: true },
  // value = 0 (לספר בלבד — לא לאימון-הזיהוי) או 1 (רגיל)
  train_text: { he: 'פגם בדפוס', ids: true, contract: true },
  line_ok: { he: 'השורה נכונה', ids: true, contract: false },
  line_split: { he: 'פיצול שורה', ids: true, contract: false },
  line_merge: { he: 'איחוד שורות', ids: true, contract: false },
  line_add: { he: 'הוספת שורה', ids: false, contract: false },
  // פסקה שמתחילה באמצע שורה: value = {word, on} (מילה 0 = para_start)
  para_break: { he: 'פסקה באמצע שורה', ids: true, contract: false },
  // "החיתוך בעמוד נבדק ותקין" — אות-אימון לחיתוך השורות; value = true
  cut_ok: { he: 'החיתוך תקין', ids: false, contract: false },
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

// שם הזרם בעברית, גם לזרם-כותרת: "כותרת", "כותרת הערות" (מאוצר-המילים), ולזרם שהספר
// נתן לו שם משלו — "כותרת <השם>". לתוויות-המסגרות ולרשימת-השינויים
export function streamName(doc, key) {
  const s = streamInfo(doc, key);
  if (!s.heading) return s.he;
  const builtin = BUILTIN_STREAMS[`${s.key}_heading`];
  return builtin && (!BUILTIN_STREAMS[s.key] || BUILTIN_STREAMS[s.key].he === s.he) ? builtin.he : `כותרת ${s.he}`;
}

export function isFurnitureStream(key) {
  return FURNITURE_STREAMS.includes(String(key || '').replace(/_heading$/, ''));
}

// סדר זרמי-התוכן בתפריטים (כמו לשוניות-הזרמים); זרמי-הספר (s_…) — אחריהם
const CONTENT_ORDER = ['main', 'notes', 'notes2', 'notes3', 'margin'];

// הזרמים לתפריט "זרם" שבסרגל, בשתי קבוצות: {content, furniture}.
// • content — זרמי-התוכן (בלי כותרות _heading), בסדר הקבוע ואחריהם זרמי-הספר
//   לפי סדר הופעתם; בלי כפילויות.
// • furniture — "ריהוט הדף": *תמיד* כל שלושת זרמי-הריהוט (כותרת עמוד, תחתית,
//   מפריד), גם כשהעמוד לא הביא אותם באוצר-המילים שלו — כדי שהבחירה בריהוט תהיה
//   שם תמיד. השם והצבע — מהעמוד, ואחרת מהמובנים.
// streams = [{key, he?, color?}] (streamChoices)
export function streamMenu(streams) {
  const byKey = new Map();
  for (const s of streams || []) {
    if (!s || typeof s.key !== 'string' || !s.key || s.key.endsWith('_heading') || byKey.has(s.key)) continue;
    byKey.set(s.key, s);
  }
  const rank = (k) => {
    const i = CONTENT_ORDER.indexOf(k);
    return i < 0 ? CONTENT_ORDER.length : i;
  };
  const content = [...byKey.values()]
    .filter((s) => !isFurnitureStream(s.key))
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s.key) - rank(b.s.key) || a.i - b.i)
    .map(({ s }) => ({ key: s.key, he: s.he || BUILTIN_STREAMS[s.key]?.he || s.key, color: s.color || BUILTIN_STREAMS[s.key]?.color || '#888888' }));
  const furniture = FURNITURE_STREAMS.map((key) => {
    const s = byKey.get(key);
    return { key, he: s?.he || BUILTIN_STREAMS[key].he, color: s?.color || BUILTIN_STREAMS[key].color };
  });
  return { content, furniture };
}
