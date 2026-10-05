// פעולות-התיקון של חוזה-העמוד: בדיקת-תקינות, החלה מקומית (תצוגה מקדימה),
// תיאור בעברית ודחיסה לפני הגשה. לוגיקה טהורה — משותפת לעורך (לקוח), לשרת
// (בדיקת הגשה מול העמוד השמור) ולמסך האישור של המנהל.
//
// החלה מקומית אינה "הניתוח" של תוכנת-הספר — היא רק מראה למתייג את מה שביקש
// (זרם שנבחר, טקסט שתוקן, מסגרת שצוירה). את המשמעות המלאה (ניתוח-מחדש,
// שכבת-האמת) קובעת תוכנת-הספר בקליטה.

import {
  OP_KINDS,
  PARA_STYLES,
  CHAR_STYLES,
  PAGE_TYPES,
  SCRIPTS,
  CERTAINTY,
  FRAME_OBJECT_KINDS,
  isStreamKey,
  isFurnitureStream,
  isBookOnly,
  isPrintDefect,
  keepHeading,
  streamName,
} from './vocab.js';
import { placeOrder, orderAfter, neighbourStream } from './placement.js';
import { tokenize, realignWords, MAX_BREAK_WORD, FURNITURE_TAB_HE } from './textModel.js';

export const MAX_OPS = 3000;
export const MAX_TEXT = 2000;
// תוכנת-הספר שומרת עד 40 מסגרות לעמוד (clean_frames: out[:40]) — מעבר לזה נחתך שם בשקט
export const MAX_FRAMES = 40;
// תיבת-שורה קטנה מזה אינה נחתכת בתוכנת-הספר (lineops.MIN_W/MIN_H) — פעולת-החיתוך הייתה נכשלת שם
export const MIN_LINE_BOX = [8, 6];
// מספר-מילה מרבי בטווחי-מילים (שורה של MAX_TEXT תווים). גם תקרה לסגנון-תו:
// אצלם הטווח נפרש לרשימה (range(lo, hi+1)) — טווח ענק היה מפיל את הקליטה
const MAX_LINK_WORD = MAX_TEXT / 2;
const MAX_WHY = 300;
const FID_RE = /^[A-Za-z0-9]{4,32}$/;
const LINK_VALUE_KINDS = ['note', 'dh'];
// מספר השורות המרבי בפעולה אחת
export const MAX_IDS_PER_OP = 500;
// קישור לעמוד אחר: אורך מרבי לתחילת-הטקסט של השורה שבעמוד ההוא (to_text/from_text), וכמה
// ממנה נשלח בפעולה (כמו בחוזה-העמוד, שם 60)
export const MAX_FAR_TEXT = 200;
export const FAR_TEXT_SENT = 60;

// פעולות שמשנות את חיתוך-השורות: אחרי אישור העמוד חוזר לתוכנת-הספר
// לחיתוך ולזיהוי-מחדש של השורות שנגעו בהן, ורק אז למעבר שני באתר
export const CUT_KINDS = ['line_split', 'line_merge', 'line_add', 'bbox'];

const isInt = (v) => Number.isInteger(v);
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);
const lineMap = (doc) => new Map((doc?.lines || []).map((l) => [l.id, l]));
const isWordRange = (r, max = MAX_LINK_WORD) =>
  Array.isArray(r) && r.length === 2 && r.every((n) => isInt(n) && n >= 0 && n <= max) && r[0] <= r[1];

// lineBox — תיבת-שורה (תיבה/שורה חדשה): גם גודל מזערי, כמו אצלם
function checkBox(bb, doc, lineBox = false) {
  if (!Array.isArray(bb) || bb.length !== 4 || !bb.every(isInt)) return 'תיבה חייבת להיות ארבעה מספרים שלמים';
  const [x0, y0, x1, y1] = bb;
  if (x1 <= x0 || y1 <= y0) return 'תיבה לא תקינה (רוחב או גובה אפסי)';
  const [w, h] = Array.isArray(doc?.size) ? doc.size : [0, 0];
  if (x0 < 0 || y0 < 0 || (w && x1 > w) || (h && y1 > h)) return 'התיבה חורגת מגבולות התמונה';
  const [mw, mh] = MIN_LINE_BOX;
  if (lineBox && (x1 - x0 < mw || y1 - y0 < mh)) return `תיבה קטנה מדי לשורה (לפחות ${mw}×${mh} פיקסלים בתמונה)`;
  return null;
}

// ---------- קישור לעמוד אחר ----------
//
// פירוש שזולג אל אחרי הסעיף שלו: שורה בעמוד הזה מקושרת לשורה בעמוד אחר של אותו ספר. זו
// הפעולה היחידה שמזהה אחד בה (ורק אחד) אינו שורה בעמוד — וגם אז רק כשהערך מצהיר על העמוד
// של אותו צד: to_page כשהשורה שבעמוד האחר היא צד הגוף (ids[1]), from_page כשהיא צד
// ההערה/הפירוש (ids[0]); לצידו מספר-השורה ותחילת-הטקסט שלה (to_line_no/to_text,
// from_line_no/from_text — אותם שמות של חוזה-העמוד לקישור שבא מעמוד אחר). המזהה הזר לא
// ממופה ולא נמחק לעולם; הצד שבעמוד ממשיך כמו כל קישור (יישור-מילים, דחיסה, סדר).
const FAR_SIDES = ['from', 'to'];
const farKeys = (side) => ({ page: `${side}_page`, lineNo: `${side}_line_no`, text: `${side}_text` });

// המקום (0 = הערה/פירוש, 1 = גוף) של המזהה היחיד ב-link_add שאינו שורה בעמוד, או -1
function farIndex(op, lines) {
  if (op?.kind !== 'link_add' || !Array.isArray(op.ids) || op.ids.length !== 2) return -1;
  const out = op.ids.map((id, k) => (lines.has(id) ? -1 : k)).filter((k) => k >= 0);
  return out.length === 1 && isInt(op.ids[out[0]]) && op.ids[out[0]] > 0 ? out[0] : -1;
}

// הצד שבעמוד אחר לפי מה שהערך מצהיר (בלי להסתכל בשורות — כך גם אחרי פיצול/איחוד
// מקומיים): {side, index, page, lineNo, text} או null
export function farLinkSide(page, value) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!v) return null;
  for (const side of FAR_SIDES) {
    const k = farKeys(side);
    if (isInt(v[k.page]) && v[k.page] !== page) {
      return { side, index: side === 'from' ? 0 : 1, page: v[k.page], lineNo: isInt(v[k.lineNo]) ? v[k.lineNo] : null, text: typeof v[k.text] === 'string' ? v[k.text] : '' };
    }
  }
  return null;
}

// בדיקת צד-העמוד-האחר של link_add (far = המקום של המזהה הזר, או -1)
function checkFarLink(doc, v, far) {
  const obj = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  if (far >= 0) {
    const pg = obj?.[farKeys(FAR_SIDES[far]).page];
    // בלי הצהרה על העמוד — סתם שורה שאינה כאן
    if (pg === undefined || pg === null) return 'שורה שאינה בעמוד הזה';
    if (!isInt(pg) || pg < 1 || pg === doc.page) return 'עמוד הקישור שגוי';
  }
  if (!obj) return null;
  for (const side of FAR_SIDES) {
    const k = farKeys(side);
    const mine = far >= 0 && FAR_SIDES[far] === side;
    // עמוד אחר מוצהר רק לצד שאכן בעמוד אחר (לצד שבעמוד — רק העמוד הזה עצמו, או כלום)
    if (obj[k.page] != null && !mine && obj[k.page] !== doc.page) return 'קישור לעמוד אחר — רק אחד משני הצדדים יכול להיות בעמוד אחר';
    if (obj[k.lineNo] !== undefined && obj[k.lineNo] !== null && !(isInt(obj[k.lineNo]) && obj[k.lineNo] >= 0)) return 'מספר-השורה בעמוד האחר לא תקין';
    if (obj[k.text] !== undefined && obj[k.text] !== null && (typeof obj[k.text] !== 'string' || obj[k.text].length > MAX_FAR_TEXT)) {
      return 'הטקסט של השורה בעמוד האחר לא תקין';
    }
  }
  return null;
}

// הקישורים לעמוד אחר ברשימת-פעולות (לבדיקה בשרת ולתצוגה): [{i, index, id, side, page,
// lineNo, text}] — i = מקום הפעולה, id = המזהה שבעמוד האחר. רק link_add שהזר בהם אחד.
export function foreignLinkRefs(doc, ops) {
  const lines = lineMap(doc);
  const out = [];
  (Array.isArray(ops) ? ops : []).forEach((op, i) => {
    const k = farIndex(op, lines);
    if (k < 0) return;
    const far = farLinkSide(doc?.page, op.value);
    if (!far || far.index !== k) return;
    out.push({ i, index: k, id: op.ids[k], side: far.side, page: far.page, lineNo: far.lineNo, text: far.text });
  });
  return out;
}

// מספר-השורה ותחילת-הטקסט של הצד שבעמוד האחר — מהעמוד השמור, לא ממה שהדפדפן שלח.
// found: Map(`${page}:${id}` → שורה {line_no, text|text_ocr}). פעולה בלי התאמה — כמות-שהיא.
export function withForeignLines(doc, ops, found) {
  const refs = new Map(foreignLinkRefs(doc, ops).map((r) => [r.i, r]));
  if (!refs.size) return Array.isArray(ops) ? ops.slice() : [];
  return ops.map((op, i) => {
    const r = refs.get(i);
    const line = r && found?.get?.(`${r.page}:${r.id}`);
    if (!line) return op;
    const k = farKeys(r.side);
    const text = String(line.text ?? line.text_ocr ?? '').trim().slice(0, FAR_TEXT_SENT);
    return { ...op, value: { ...op.value, [k.lineNo]: isInt(line.line_no) ? line.line_no : null, [k.text]: text } };
  });
}

// בודק פעולה אחת מול העמוד המקורי (כפי שיובא). מחזיר הודעת שגיאה בעברית או null.
// ids חייבים להיות שורות קיימות בעמוד — אין פעולות על שורות שנוצרו מקומית
// (פיצול/הוספה): תוכנת-הספר עוד לא קולטת אותן, והמזהים שלהן אינם שלה. החריג היחיד:
// קישור לעמוד אחר (link_add עם מזהה זר אחד ועמוד מוצהר — farLinkSide); שם השרת גם בודק
// שהשורה אכן בעמוד ההוא (pool.resolveForeignLinks).
export function validateOp(doc, op) {
  if (!op || typeof op !== 'object') return 'פעולה לא תקינה';
  const spec = OP_KINDS[op.kind];
  if (!spec) return `סוג-פעולה לא מוכר: ${op.kind}`;
  if (op.page !== doc.page) return `הפעולה שייכת לעמוד ${op.page} ולא לעמוד ${doc.page}`;

  const lines = lineMap(doc);
  const ids = op.ids;
  const far = farIndex(op, lines);
  if (spec.ids) {
    if (!Array.isArray(ids) || !ids.length) return 'לא נבחרו שורות';
    if (ids.length > MAX_IDS_PER_OP) return 'יותר מדי שורות בפעולה אחת';
    if (!ids.every((i, k) => isInt(i) && (lines.has(i) || k === far))) return 'שורה שאינה בעמוד הזה';
    if (new Set(ids).size !== ids.length) return op.kind === 'link_add' ? 'קישור הוא בין שתי שורות שונות' : 'שורה כפולה בפעולה';
  } else if (ids !== undefined && !(Array.isArray(ids) && ids.length === 0)) {
    return 'לפעולה הזו אין שורות';
  }

  const v = op.value;
  switch (op.kind) {
    case 'stream':
      return isStreamKey(v) ? null : `זרם לא מוכר: ${v}`;
    case 'para':
      return Object.hasOwn(PARA_STYLES, v) ? null : `סגנון-פסקה לא מוכר: ${v}`;
    case 'para_start':
    case 'mixed_line':
      return v === 0 || v === 1 ? null : 'הערך חייב להיות 0 או 1';
    case 'script':
      return Object.hasOwn(SCRIPTS, v) ? null : `כתב לא מוכר: ${v}`;
    case 'styles': {
      if (!v || typeof v !== 'object') return 'סגנון-תו חסר';
      if (!Object.hasOwn(CHAR_STYLES, v.style)) return `סגנון-תו לא מוכר: ${v.style}`;
      if (!isWordRange(v.words)) return 'טווח-מילים לא תקין';
      if (typeof v.on !== 'boolean') return 'חסר on (הוספה/הסרה)';
      return null;
    }
    case 'text':
      if (typeof v !== 'string') return 'טקסט חסר';
      if (v.length > MAX_TEXT) return 'הטקסט ארוך מדי';
      return ids.length === 1 ? null : 'תיקון-טקסט הוא לשורה אחת';
    case 'status':
      return v === 'removed' || v === 'restore' ? null : 'מצב לא מוכר';
    case 'bbox':
      return checkBox(v, doc, true) || (ids.length === 1 ? null : 'תיבה היא לשורה אחת');
    case 'page_type':
      return Object.hasOwn(PAGE_TYPES, v) ? null : `סוג-עמוד לא מוכר: ${v}`;
    case 'frames_set': {
      const frames = v?.frames;
      if (!Array.isArray(frames)) return 'רשימת מסגרות חסרה';
      if (frames.length > MAX_FRAMES) return 'יותר מדי מסגרות';
      // confirmed: המתנדב אישר את המסגרות המוצעות כמות-שהן. manual: פריסה ידנית
      // (סדר-הקריאה לפי המסגרות) — העורך שולח רק true; false היה מעביר אצלם את
      // העמוד למצב "מסגרות מתקנות", ולכן אינו מתקבל מבחוץ
      if (v.confirmed !== undefined && typeof v.confirmed !== 'boolean') return 'ערך אישור-המסגרות לא תקין';
      if (v.manual !== undefined && v.manual !== true) return 'ערך פריסה-ידנית לא תקין';
      const seen = new Set();
      for (const f of frames) {
        if (!f || !isStreamKey(f.stream)) return 'מסגרת בלי זרם תקין';
        if (!FID_RE.test(f.fid || '') || seen.has(f.fid)) return 'מזהה-מסגרת לא תקין';
        seen.add(f.fid);
        const e = checkBox(f.bbox, doc);
        if (e) return `מסגרת: ${e}`;
        if (!isInt(f.order) || f.order < 1) return 'סדר-מסגרת לא תקין';
        if (f.kind !== undefined && !Object.hasOwn(FRAME_OBJECT_KINDS, f.kind)) return 'סוג-מסגרת לא מוכר';
      }
      return null;
    }
    case 'frames_auto':
    case 'frames_clear':
      return null;
    case 'frame_seq':
      if (!v || !FID_RE.test(v.fid || '')) return 'מזהה-מסגרת חסר';
      return isInt(v.seq) && v.seq >= 1 && v.seq <= 50 ? null : 'מספר-מסגרת לא תקין';
    case 'link_add': {
      // ids = [שורת ההערה/הפירוש, שורת הגוף]; value (רשות) = טווחי-המילים
      // בשתי השורות וסוג הקישור. הצורה הישנה (בלי value) נשארת תקפה. צד אחד בעמוד
      // אחר — העמוד שלו חייב להיות מוצהר (checkFarLink)
      if (ids.length !== 2) return 'קישור ידני דורש בדיוק שתי שורות';
      const fe = checkFarLink(doc, v, far);
      if (fe) return fe;
      if (v == null) return null;
      if (typeof v !== 'object' || Array.isArray(v)) return 'ערך-קישור לא תקין';
      if (v.from_words !== undefined && !isWordRange(v.from_words)) return 'טווח-המילים בצד ההערה לא תקין';
      if (v.to_words !== undefined && !isWordRange(v.to_words)) return 'טווח-המילים בצד הגוף לא תקין';
      if (v.kind !== undefined && !LINK_VALUE_KINDS.includes(v.kind)) return `סוג-קישור לא מוכר: ${v.kind}`;
      return null;
    }
    case 'link_ok':
    case 'link_del': {
      if (!v || !isInt(v.src_line) || !lines.has(v.src_line)) return 'שורת-המקור של הקישור חסרה';
      if (v.page !== doc.page) return 'עמוד הקישור שגוי';
      return null;
    }
    case 'link_reset': {
      // "החזר לאוטומטי": רק קישור שהגיע עם העמוד (מהשורה הזו) — את מה שנעשה בעריכה הזו מבטלים בהסרת הפעולה
      if (!v || !isInt(v.src_line) || !lines.has(v.src_line)) return 'שורת-המקור של הקישור חסרה';
      if (v.page !== doc.page) return 'עמוד הקישור שגוי';
      // ורק לקישור שבוטל ("אין קישור" — בלי יעד): קישור חי אינו "חוזר" לאוטומטי מכאן
      if (!(doc.links || []).some((k) => k && k.from_line === v.src_line)) return 'אין בעמוד קישור מהשורה הזו';
      return (doc.links || []).some((k) => k && k.from_line === v.src_line && k.to_line == null) ? null : 'הקישור מהשורה הזו לא בוטל';
    }
    case 'certainty':
      if (!v || !Object.hasOwn(CERTAINTY, v.v)) return 'ערך-ודאות לא מוכר';
      return v.why == null || (typeof v.why === 'string' && v.why.length <= MAX_WHY) ? null : 'הסבר ארוך מדי';
    case 'train_text':
      return v === 0 || v === 1 ? null : 'הערך חייב להיות 0 (פגם בדפוס) או 1 (רגיל)';
    case 'line_ok':
      return null;
    case 'line_split': {
      if (ids.length !== 1) return 'פיצול הוא לשורה אחת';
      const bb = lines.get(ids[0]).bbox || [];
      return isInt(v?.x) && v.x > bb[0] && v.x < bb[2] ? null : 'נקודת-הפיצול מחוץ לשורה';
    }
    case 'line_merge':
      return ids.length === 2 ? null : 'איחוד דורש בדיוק שתי שורות';
    case 'line_add': {
      const e = checkBox(v?.bbox, doc, true);
      if (e) return e;
      if (v.text != null && (typeof v.text !== 'string' || v.text.length > MAX_TEXT)) return 'טקסט לא תקין';
      if (v.stream != null && !isStreamKey(v.stream)) return 'זרם לא מוכר';
      return null;
    }
    case 'para_break': {
      // מספר-המילה מתייחס לטקסט הנוכחי של השורה (אחרי תיקוני-טקסט קודמים
      // ברשימה) — בשרת אי-אפשר לבדוק זול מול אורכה, רק את הטווח הסביר
      if (ids.length !== 1) return 'פסקה באמצע שורה היא לשורה אחת';
      if (!v || typeof v !== 'object') return 'ערך חסר';
      if (!isInt(v.word) || v.word < 1 || v.word > MAX_BREAK_WORD) return 'מספר-מילה לא תקין';
      return typeof v.on === 'boolean' ? null : 'חסר on (הוספה/הסרה)';
    }
    case 'cut_ok':
      return v === true ? null : 'הערך חייב להיות true';
    default:
      return null;
  }
}

// בדיקת רשימה שלמה: מחזיר את השגיאה הראשונה עם מספר הפעולה, או null
export function validateOps(doc, ops) {
  if (!Array.isArray(ops)) return 'רשימת פעולות חסרה';
  if (!ops.length) return 'אין תיקונים להגשה';
  if (ops.length > MAX_OPS) return `יותר מדי פעולות (${ops.length})`;
  for (let i = 0; i < ops.length; i++) {
    const e = validateOp(doc, ops[i]);
    if (e) return `פעולה ${i + 1}: ${e}`;
  }
  return null;
}

// ---------- צורת-החוזה בלבד ----------

const pick = (o, keys) => {
  const out = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
};
const arr = (v) => (Array.isArray(v) ? v.slice() : v);

// הערך של כל סוג — רק השדות שהחוזה מכיר (ובלי שדות-פנים של העורך). שדה
// שאינו כאן לא נשמר ולא יוצא בקובץ-התיקונים: שדה מיותר אצלם יכול לשנות
// התנהגות (למשל snap במסגרות) או סתם לנפח את הקובץ. undefined = בלי value.
function cleanValue(kind, v) {
  switch (kind) {
    case 'styles':
      return { ...pick(v, ['style', 'on']), ...(v && Array.isArray(v.words) ? { words: v.words.slice(0, 2) } : {}) };
    case 'bbox':
      return arr(v);
    case 'frames_set': {
      const out = {};
      if (v && Array.isArray(v.frames)) {
        out.frames = v.frames.map((f) => {
          const fr = pick(f, ['fid', 'stream', 'order', 'kind']);
          if (f && f.bbox !== undefined) fr.bbox = arr(f.bbox);
          return fr;
        });
      } else if (v && v.frames !== undefined) out.frames = v.frames;
      if (v && v.confirmed !== undefined) out.confirmed = v.confirmed;
      if (v && v.manual !== undefined) out.manual = v.manual;
      return out;
    }
    case 'frames_auto':
    case 'frames_clear':
    case 'line_ok':
    case 'line_merge':
      return undefined;
    case 'frame_seq':
      return pick(v, ['fid', 'seq']);
    case 'link_add': {
      if (v == null) return undefined;
      if (typeof v !== 'object' || Array.isArray(v)) return v;
      // + הצד שבעמוד אחר: העמוד, מספר-השורה ותחילת-הטקסט (farLinkSide)
      const out = pick(v, ['kind', 'from_page', 'from_line_no', 'from_text', 'to_page', 'to_line_no', 'to_text']);
      if (v.from_words !== undefined) out.from_words = arr(v.from_words);
      if (v.to_words !== undefined) out.to_words = arr(v.to_words);
      return out;
    }
    case 'link_ok':
    case 'link_del':
    case 'link_reset':
      return pick(v, ['src_line', 'page']);
    case 'certainty':
      return pick(v, ['v', 'why']);
    case 'line_split':
      return pick(v, ['x']);
    case 'line_add': {
      const out = pick(v, ['text', 'stream']);
      if (v && v.bbox !== undefined) out.bbox = arr(v.bbox);
      return out;
    }
    case 'para_break':
      return pick(v, ['word', 'on']);
    default:
      // ערך פשוט (מחרוזת/מספר/true) — כמות-שהוא; אובייקט בסוג שערכו פשוט — ייפסל בבדיקה
      return v;
  }
}

// פעולה בצורת-החוזה: {kind, page, ids?, value?} עם ערך שנבנה מחדש מהשדות
// המוכרים בלבד. אותו ניקוי בדפדפן (לפני ההגשה) ובשרת (לפני הבדיקה והשמירה).
export function sanitizeOp(o) {
  const op = { kind: o?.kind, page: o?.page };
  if (Array.isArray(o?.ids)) op.ids = o.ids.slice();
  if (o?.value !== undefined) {
    const v = cleanValue(op.kind, o.value);
    if (v !== undefined) op.value = v;
  }
  return op;
}

export const sanitizeOps = (ops) => (Array.isArray(ops) ? ops.map(sanitizeOp) : []);

// ---------- החלה מקומית ----------

const union = (boxes) => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];

// מזהה זמני לשורה שנוצרה מקומית — שלילי ודטרמיניסטי (לפי מקום הפעולה),
// כך שחישוב-מחדש של התצוגה נותן תמיד אותם מזהים
export const tempLineId = (opIndex, k) => -(opIndex * 10 + k + 1);

function mapLines(doc, ids, fn) {
  const set = new Set(ids);
  return { ...doc, lines: doc.lines.map((l) => (set.has(l.id) ? fn(l) : l)) };
}

function toggleStyle(line, style, [lo, hi], on) {
  const words = (line.words || []).map((w, i) => {
    if (i < lo || i > hi) return w;
    const cur = new Set(w.styles || []);
    if (on) cur.add(style);
    else cur.delete(style);
    return { ...w, styles: [...cur] };
  });
  return { ...line, words, _touched: true };
}

// ---------- תיקון-טקסט: יישור המילים והסימונים ----------

// גבול-פסקה שהיה במילה b: עובר למקומה החדש; אם המילה נמחקה — למילה ששרדה
// אחריה (הפסקה ממשיכה להתחיל באותו מקום בטקסט). -1 = אין מילה אחריו.
function remapBreak(b, map) {
  for (let t = b; t < map.length; t++) if (map[t] >= 0) return map[t];
  return -1;
}

// טווח-מילים ישן ← החדש: כל המילים החדשות שנגזרו ממילה שבטווח (null אם כולן נמחקו)
function remapRange(r, src) {
  if (!Array.isArray(r)) return r;
  let lo = -1;
  let hi = -1;
  src.forEach((o, j) => {
    if (o >= r[0] && o <= r[1]) {
      if (lo < 0) lo = j;
      hi = j;
    }
  });
  return lo < 0 ? null : [lo, hi];
}

// ציוני-הערות של השורה (marks — a/b = מיקום-תווים): זזים עם המילה שלהם;
// ציון שמילתו נמחקה יורד
function remapMarks(list, oldText, newText, r) {
  if (!Array.isArray(list)) return list;
  const ow = tokenize(oldText).filter((t) => t.w === 'word');
  const nw = tokenize(newText).filter((t) => t.w === 'word');
  const out = [];
  for (const mk of list) {
    const w = Number.isFinite(mk?.a) ? ow.findIndex((t) => mk.a >= t.start && mk.a < t.end) : -1;
    if (w < 0) {
      out.push(mk);
      continue;
    }
    const k = r.map[w];
    if (k < 0) continue;
    const shift = nw[k].start - ow[w].start;
    const at = (x) => (r.same[w] ? x + shift : Math.max(nw[k].start, Math.min(x + shift, nw[k].end)));
    const next = { ...mk, a: at(mk.a) };
    if (Number.isFinite(mk.b)) next.b = at(mk.b);
    out.push(next);
  }
  return out;
}

// תיקון-טקסט לשורות ids: words[] מיושרות לטקסט החדש (textModel.realignWords)
// כך שסגנונות-התו, הכתב, גבולות-הפסקה (para_breaks) וקצות-הקישורים נשארים על
// המילים הנכונות גם כשמספר המילים משתנה. סימוני-החשד (הצעות, מודל-שפה,
// ביטחון-נמוך) נשארים רק על מילים שלא השתנו — מילה שתוקנה כבר אינה חשודה.
function applyText(doc, ids, text) {
  const set = new Set(ids);
  let links = doc.links;
  let marks = doc.marks;
  const lines = doc.lines.map((l) => {
    if (!set.has(l.id)) return l;
    const oldText = String(l.text ?? l.text_ocr ?? '');
    const r = realignWords(oldText, l.words, text);
    const kept = (i) => (Number.isInteger(i) && r.same[i] ? r.map[i] : -1);
    const markers = (list) => (Array.isArray(list) ? list.filter((x) => kept(x?.i) >= 0).map((x) => ({ ...x, i: kept(x.i) })) : []);

    let paraStart = !!l.para_start;
    const breaks = new Set();
    for (const b of l.para_breaks || []) {
      if (!isInt(b) || b < 0) continue;
      const k = remapBreak(b, r.map);
      if (k === 0) paraStart = true; // הפסקה מתחילה עכשיו בתחילת השורה
      else if (k > 0) breaks.add(k);
    }

    if (Array.isArray(links)) {
      links = links.map((k) => {
        let out = k;
        if (k.from_line === l.id && Array.isArray(k.from_words)) out = { ...out, from_words: remapRange(k.from_words, r.src) };
        if (k.to_line === l.id && Array.isArray(k.to_words)) out = { ...out, to_words: remapRange(k.to_words, r.src) };
        return out;
      });
    }
    const mk = marks?.[String(l.id)];
    if (Array.isArray(mk)) marks = { ...marks, [String(l.id)]: remapMarks(mk, oldText, text, r) };

    const next = {
      ...l,
      text,
      status: text === (l.text_ocr ?? '') ? 'ok' : 'fixed',
      words: r.words,
      alternatives: markers(l.alternatives),
      lm_flags: markers(l.lm_flags),
      flags: { ...(l.flags || {}), low_words: (l.flags?.low_words || []).map(kept).filter((i) => i >= 0) },
      // "תוקנה" = שונה מהטקסט שיובא (_text0 — buildView). הקלדה שבוטלה מיד
      // (אות ומחיקתה) אינה תיקון: השורה נשארת "לא נגעו בה" ו"אשר גם את השאר" מאשר אותה
      _textEdited: text !== (typeof l._text0 === 'string' ? l._text0 : oldText),
    };
    if (l.para_breaks !== undefined || breaks.size) next.para_breaks = [...breaks].sort((a, b) => a - b);
    if (paraStart) next.para_start = true;
    return next;
  });
  const out = { ...doc, lines };
  if (links !== doc.links) out.links = links;
  if (marks !== doc.marks) out.marks = marks;
  return out;
}

// ---------- פיצול/איחוד/הוספה ----------

// words[] שתואמות לטקסט השורה (אותו מספר מילים), ואחרת מילים ריקות מסגנון
function alignedWords(line) {
  const toks = tokenize(line?.text ?? '').filter((t) => t.w === 'word');
  const ws = Array.isArray(line?.words) ? line.words : [];
  return toks.map((t) => (ws.length === toks.length && ws[t.i] && typeof ws[t.i] === 'object' ? { ...ws[t.i], text: t.text } : { text: t.text, styles: [] }));
}

// הטקסט של שני חצאי שורה מפוצלת — קירוב לתצוגה בלבד (החצאים ממתינים לזיהוי-
// מחדש ונעולים לעריכה): לפי תיבות-המילים כשיש, אחרת לפי יחס-הרוחב. first =
// החצי שנקרא ראשון (בעברית הימני, בלועזית השמאלי).
function splitText(line, x, rtl) {
  const text = String(line.text ?? '');
  const toks = tokenize(text).filter((t) => t.w === 'word');
  const words = alignedWords(line);
  const [x0, , x1] = line.bbox;
  const boxed = words.length && words.every((w) => Array.isArray(w.bbox) && w.bbox.length === 4);
  const frac = x1 > x0 ? (rtl ? (x1 - x) / (x1 - x0) : (x - x0) / (x1 - x0)) : 0.5;
  const inFirst = (t) => {
    if (boxed) {
      const b = words[t.i].bbox;
      const cx = (b[0] + b[2]) / 2;
      return rtl ? cx >= x : cx < x;
    }
    return (t.start + t.end) / 2 < frac * text.length;
  };
  const part = (want) => {
    const sel = toks.filter((t) => inFirst(t) === want);
    return { text: sel.map((t) => t.text).join(' '), words: sel.map((t) => words[t.i]) };
  };
  return { first: part(true), second: part(false) };
}

// מחיל פעולה אחת על עותק של העמוד (לא משנה את הקלט). opIndex משמש רק
// למזהים זמניים של שורות חדשות.
export function applyOp(doc, op, opIndex = 0) {
  const v = op.value;
  const ids = op.ids || [];
  switch (op.kind) {
    case 'stream':
      return mapLines(doc, ids, (l) => ({ ...l, stream: v, stream_src: 'human' }));
    case 'para':
      return mapLines(doc, ids, (l) => ({ ...l, para_style: v, _touched: true }));
    case 'para_start':
      return mapLines(doc, ids, (l) => {
        const next = { ...l, para_start: !!v, _touched: true };
        // גבול "במילה 0" (אחרי מחיקת תחילת השורה) = para_start; ההחלטה המפורשת גוברת
        if (Array.isArray(l.para_breaks) && l.para_breaks.includes(0)) next.para_breaks = l.para_breaks.filter((k) => k !== 0);
        return next;
      });
    case 'para_break':
      return mapLines(doc, ids, (l) => {
        const set = new Set((l.para_breaks || []).filter(isInt));
        if (v.on) set.add(v.word);
        else set.delete(v.word);
        return { ...l, para_breaks: [...set].sort((a, b) => a - b), _touched: true };
      });
    case 'script':
      return mapLines(doc, ids, (l) => ({ ...l, script: v, _touched: true }));
    case 'styles':
      return mapLines(doc, ids, (l) => toggleStyle(l, v.style, v.words, v.on));
    case 'text':
      return applyText(doc, ids, v);
    case 'status':
      return mapLines(doc, ids, (l) =>
        v === 'removed'
          ? { ...l, status: 'removed', _prevStatus: l.status === 'removed' ? l._prevStatus : l.status }
          : { ...l, status: l._prevStatus || (l.status === 'removed' ? 'ok' : l.status) }
      );
    case 'bbox':
      return mapLines(doc, ids, (l) => ({ ...l, bbox: v, polygon: null, _touched: true, _recut: true }));
    case 'page_type':
      return { ...doc, page_type: v, page_type_src: 'human' };
    case 'frames_set':
      return {
        ...doc,
        frames: v.frames.map((f) => ({ ...f, seq: f.seq ?? keepSeq(doc, f.fid) })),
        frames_confirmed: v.confirmed === true,
      };
    case 'frames_clear':
      return { ...doc, frames: [], frames_confirmed: false };
    case 'frames_auto':
      return doc; // מחושב בתוכנת-הספר; העורך שולח במקומו frames_set מקומי
    case 'frame_seq':
      return { ...doc, frames: (doc.frames || []).map((f) => (f.fid === v.fid ? { ...f, seq: v.seq } : f)) };
    case 'cut_ok':
      return { ...doc, cut_ok: true };
    case 'link_add': {
      // לכל שורת-הערה/פירוש קישור אחד — החדש מחליף את הקודם (גם כשהשורה בעמוד אחר).
      // _added: נוסף בעריכה הזו (לא הגיע עם העמוד) — אפשר להסיר את הפעולה עצמה לפני ההגשה
      const links = (doc.links || []).filter((k) => k.from_line !== ids[0]);
      const link = { from_line: ids[0], from_mark: null, to_line: ids[1], to_page: doc.page, kind: v?.kind || 'note', conf: 1, src: 'human', suspect: null, _added: true };
      if (Array.isArray(v?.from_words)) link.from_words = v.from_words.slice();
      if (Array.isArray(v?.to_words)) link.to_words = v.to_words.slice();
      // הצד שבעמוד אחר — כמו בחוזה-העמוד: עמוד, מספר-שורה ותחילת-הטקסט (flowEdit.farLabel)
      const far = farLinkSide(doc.page, v);
      if (far) {
        const k = farKeys(far.side);
        link[k.page] = far.page;
        link[k.lineNo] = far.lineNo;
        link[k.text] = far.text;
      }
      links.push(link);
      return { ...doc, links };
    }
    case 'link_ok':
      return { ...doc, links: (doc.links || []).map((k) => (k.from_line === v.src_line ? { ...k, src: 'human', suspect: null } : k)) };
    case 'link_del':
      return { ...doc, links: (doc.links || []).filter((k) => k.from_line !== v.src_line) };
    case 'link_reset':
      // מה שהמחשב יקבע — רק בתוכנת-הספר; כאן הקישור מסומן "יחזור לאוטומטי" (LinksTab)
      return { ...doc, links: (doc.links || []).map((k) => (k.from_line === v.src_line ? { ...k, _reset: true } : k)) };
    case 'mixed_line':
      return mapLines(doc, ids, (l) => ({ ...l, flags: { ...(l.flags || {}), mixed_line: !!v }, _touched: true }));
    case 'certainty':
      return mapLines(doc, ids, (l) => ({ ...l, certainty: v.v, certainty_why: v.why ?? null }));
    case 'train_text':
      return mapLines(doc, ids, (l) => ({ ...l, train_text: v }));
    case 'line_ok':
      return mapLines(doc, ids, (l) => ({ ...l, _ok: true, status: l.status === 'pending' ? 'ok' : l.status }));
    case 'line_split': {
      const orig = doc.lines.find((l) => l.id === ids[0]);
      if (!orig || !Array.isArray(orig.bbox)) return doc;
      // כל חצי מקבל מקום בסדר-הקריאה לפי הטור שלו (שורה שחצתה שני טורים
      // מתפצלת לסוף-טור ולתחילת-הטור-הבא); בשוויון — החצי שנקרא ראשון קודם
      const rest = doc.lines.filter((l) => l !== orig);
      const [x0, y0, x1, y1] = orig.bbox;
      const rtl = orig.script !== 'latin';
      const firstBox = rtl ? [v.x, y0, x1, y1] : [x0, y0, v.x, y1];
      const secondBox = rtl ? [x0, y0, v.x, y1] : [v.x, y0, x1, y1];
      const o1 = placeOrder(rest, firstBox);
      let o2 = placeOrder(rest, secondBox);
      if (o2 === o1) o2 = orderAfter(rest, o1);
      const { first, second } = splitText(orig, v.x, rtl);
      const a = { ...blankLine(orig), id: tempLineId(opIndex, 0), bbox: firstBox, order: o1, ...first, para_start: !!orig.para_start };
      const b = { ...blankLine(orig), id: tempLineId(opIndex, 1), bbox: secondBox, order: o2, ...second };
      const lines = doc.lines.slice();
      lines.splice(lines.indexOf(orig), 1, a, b);
      return { ...doc, lines };
    }
    case 'line_merge': {
      const [a, b] = ids.map((i) => doc.lines.find((l) => l.id === i));
      if (!a || !b) return doc;
      const first = (a.order ?? 0) <= (b.order ?? 0) ? a : b;
      const second = first === a ? b : a;
      const merged = {
        ...blankLine(first),
        id: tempLineId(opIndex, 0),
        bbox: union([a.bbox, b.bbox]),
        order: first.order,
        text: [first.text, second.text].filter(Boolean).join(' '),
        words: [...alignedWords(first), ...alignedWords(second)],
        para_start: !!first.para_start,
      };
      return { ...doc, lines: doc.lines.filter((l) => l !== a && l !== b).concat(merged) };
    }
    case 'line_add': {
      // זרם ברירת-המחדל: של השורה הקרובה באותו טור. כשלא נבחר זרם במפורש הוא
      // "אוטומטי" — מסגרת שהשורה בתוכה עדיין קובעת את זרמה
      const auto = !v.stream;
      const stream = v.stream || neighbourStream(doc.lines, v.bbox);
      const nl = {
        ...blankLine(null),
        id: tempLineId(opIndex, 0),
        bbox: v.bbox,
        text: v.text || '',
        stream,
        stream_src: auto ? 'auto' : 'human',
        order: placeOrder(doc.lines, v.bbox),
      };
      if (auto) nl._auto = { stream, stream_src: 'auto' };
      return { ...doc, lines: doc.lines.concat(nl) };
    }
    default:
      return doc;
  }
}

function keepSeq(doc, fid) {
  return (doc.frames || []).find((f) => f.fid === fid)?.seq ?? null;
}

// שורה שנוצרה מקומית (פיצול/איחוד/הוספה): נעולה לעריכה נוספת עד הקליטה,
// וממתינה לחיתוך ולזיהוי-מחדש בתוכנת-הספר (_recut). חלקי-פיצול ושורה מאוחדת יורשים
// מהשורה המקורית גם את מה שזוהה לה — הזרם שיובא (_auto) והניחוש לזרם (pred.stream) —
// כך שכותרת-רצה שפוצלה נשארת "ריהוט שזוהה" גם בתוך מסגרת של טקסט (scanGeometry.furnitureMarks)
function blankLine(src) {
  const detected = {
    ...(src?._auto ? { _auto: { ...src._auto } } : {}),
    pred: src?.pred?.stream ? { stream: src.pred.stream } : {},
  };
  return {
    line_no: src?.line_no ?? null,
    polygon: null,
    baseline: null,
    text: '',
    text_ocr: '',
    conf: null,
    status: 'pending',
    words: [],
    stream: src?.stream || 'main',
    stream_src: src?.stream_src || 'auto',
    para_start: false,
    para_style: src?.para_style || null,
    script: src?.script || null,
    flags: {},
    certainty: null,
    alternatives: [],
    lm_flags: [],
    ...detected,
    _new: true,
    _recut: true,
  };
}

// ---------- מסגרות ← זרם וסדר-קריאה (כמו core/page/frames.py אצלם) ----------

const cxOf = (b) => (b[0] + b[2]) / 2;
const cyOf = (b) => (b[1] + b[3]) / 2;
const areaOf = (b) => (b[2] - b[0]) * (b[3] - b[1]);
const vOverlap = (a, b) => Math.min(a[3], b[3]) - Math.max(a[1], b[1]);

// מסגרות-הטקסט (בלי מסגרות-אובייקט) לפי סדר-הקריאה
function textFramesOf(doc) {
  return (doc?.frames || [])
    .filter((f) => f && !f.kind && isBox(f.bbox))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (a.f.order ?? 0) - (b.f.order ?? 0) || a.i - b.i)
    .map((x) => x.f);
}

// המסגרת שהשורה שייכת אליה (_where אצלם): הקטנה ביותר שמכילה את *מרכז*
// השורה; בשוויון — המוקדמת בסדר. -1 אם אין. מסגרת בתוך מסגרת (כותרת או
// הערות בתוך מסגרת-ראשי גדולה) — הפנימית קובעת.
function frameIndexOf(frames, bbox) {
  const cx = cxOf(bbox);
  const cy = cyOf(bbox);
  let best = -1;
  let bestArea = Infinity;
  frames.forEach((f, i) => {
    const b = f.bbox;
    if (cx < b[0] || cx > b[2] || cy < b[1] || cy > b[3]) return;
    const a = areaOf(b);
    if (a < bestArea) {
      best = i;
      bestArea = a;
    }
  });
  return best;
}

// זרם-מהמסגרת: שורה שמרכזה בתוך מסגרת-טקסט מקבלת את זרם המסגרת
// (stream_src='frame'), אלא אם נקבע לה זרם ביד (human). מסגרת-כותרת (…_heading,
// למשל "כותרת הערות") נותנת לכל שורותיה את זרם-הכותרת הזה. שורת-כותרת נשארת
// כותרת של זרם-המסגרת (keepHeading = _keep_heading אצלם) — "רמה 2 לא נמחקת
// בגלל מסגרת". שורה שמרכזה בפנים אך היא בולטת החוצה מקבלת גם היא את הזרם
// (כך גם אצלם לתצוגה; לאמת-האימון הם סופרים רק שורה שכולה בפנים — ולכן
// הסריקה מסמנת אותה באדום). בלי מסגרת — חזרה לזרם שיובא (_auto).
function applyFrameStreams(doc) {
  const frames = textFramesOf(doc);
  return {
    ...doc,
    lines: doc.lines.map((l) => {
      if (l.stream_src === 'human' || !isBox(l.bbox)) return l;
      const fi = frames.length ? frameIndexOf(frames, l.bbox) : -1;
      if (fi >= 0) return { ...l, stream: keepHeading(frames[fi].stream, l._auto?.stream ?? l.stream), stream_src: 'frame' };
      return l._auto ? { ...l, stream: l._auto.stream, stream_src: l._auto.stream_src } : l;
    }),
  };
}

// מיון-קריאה (_rows_rtl): מלמעלה למטה; שורות באותו קו-גובה — מימין לשמאל.
// "אותו קו-גובה" = חפיפה לגובה של יותר מחצי הגובה הקטן עם אחת מהשורות שכבר בשורה — אבל לעולם לא שתי
// תיבות שחופפות לרוחב (יותר מ-30% מהצרה וגם יותר מגובה-וחצי): אלה שתי שורות של אותו טור שהתיבות שלהן
// גבוהות (רש"י צפוף, דף עקום), וסדרן מלמעלה למטה. בלי זה הסדר ביניהן נקבע לפי פיקסלים בודדים בקצה השמאלי
// ושורה תחתונה נקראה לפני העליונה. אותו כלל כמו בתוכנת-הספר (orderguard.py); המקרים המשותפים —
// rowOrder.cases.json.
export const ROW_RULE = { V_JOIN: 0.5, X_CLASH: 0.3, H_CLASH: 1.5 };
const hOf = (b) => b[3] - b[1];
const hOverlap = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
function rowClash(a, b) {
  const ov = hOverlap(a, b);
  return ov > ROW_RULE.X_CLASH * Math.min(a[2] - a[0], b[2] - b[0]) && ov > ROW_RULE.H_CLASH * Math.min(hOf(a), hOf(b));
}
function joinsRow(row, b) {
  return (
    row.some((it) => vOverlap(it.bbox, b) > ROW_RULE.V_JOIN * Math.min(hOf(it.bbox), hOf(b))) &&
    !row.some((it) => rowClash(it.bbox, b))
  );
}
export function rowsRtl(items) {
  const rows = [];
  for (const it of items.slice().sort((a, b) => cyOf(a.bbox) - cyOf(b.bbox))) {
    const last = rows[rows.length - 1];
    if (last && joinsRow(last, it.bbox)) last.push(it);
    else rows.push([it]);
  }
  const out = [];
  for (const row of rows) out.push(...row.sort((a, b) => b.bbox[0] - a.bbox[0]));
  return out;
}

// שני טורים בתוך מסגרת (_columns_of): Map(מזהה → 'r'|'l'|'w') או null
function columnSides(items, fb) {
  if (items.length < 4) return null;
  const mid = (fb[0] + fb[2]) / 2;
  const tol = 0.04 * Math.max(1, fb[2] - fb[0]);
  const side = new Map();
  for (const it of items) {
    const b = it.bbox;
    side.set(it.id, b[0] < mid - tol && b[2] > mid + tol ? 'w' : cxOf(b) > mid ? 'r' : 'l');
  }
  const cols = items.filter((it) => side.get(it.id) !== 'w');
  let paired = 0;
  for (const it of cols) {
    for (const q of cols) {
      if (side.get(q.id) === side.get(it.id)) continue;
      if (vOverlap(it.bbox, q.bbox) > 0.5 * Math.min(it.bbox[3] - it.bbox[1], q.bbox[3] - q.bbox[1])) {
        paired++;
        break;
      }
    }
  }
  const nR = cols.filter((it) => side.get(it.id) === 'r').length;
  const nL = cols.length - nR;
  if (nR < 2 || nL < 2 || cols.length < 0.6 * items.length || paired < 0.5 * cols.length) return null;
  return side;
}

// סדר-הקריאה בתוך מסגרת (_order_in_frame): דו-טורית — טור ימין ואז שמאל,
// ושורה חוצת-טורים היא מחסום; אחרת מלמעלה למטה, מימין לשמאל
function orderInFrame(items, fb) {
  const side = columnSides(items, fb);
  if (!side) return rowsRtl(items);
  const out = [];
  let seg = [];
  const flush = () => {
    out.push(...seg.filter((it) => side.get(it.id) === 'r'), ...seg.filter((it) => side.get(it.id) === 'l'));
    seg = [];
  };
  for (const it of items.slice().sort((a, b) => cyOf(a.bbox) - cyOf(b.bbox))) {
    if (side.get(it.id) === 'w') {
      flush();
      out.push(it);
    } else seg.push(it);
  }
  flush();
  return out;
}

// סדר-הקריאה של העמוד לפי המסגרות (assign_to_frames(manual=True) אצלם):
// השורות שבמסגרות — מסגרת אחרי מסגרת לפי מספרה, ובתוך כל מסגרת בסדר-הקריאה
// שלה; אחריהן כל השאר בסדר שהיה. order = 1..n.
function applyFrameOrder(doc) {
  const frames = textFramesOf(doc);
  if (!frames.length) return doc;
  const live = doc.lines.filter((l) => isBox(l.bbox) && l.status !== 'removed');
  const where = new Map();
  for (const l of live) {
    const fi = frameIndexOf(frames, l.bbox);
    if (fi >= 0) where.set(l.id, fi);
  }
  if (!where.size) return doc;
  const seq = [];
  frames.forEach((f, fi) => seq.push(...orderInFrame(live.filter((l) => where.get(l.id) === fi), f.bbox)));
  const inFrames = new Set(seq.map((l) => l.id));
  const rest = doc.lines.filter((l) => !inFrames.has(l.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const rank = new Map([...seq, ...rest].map((l, i) => [l.id, i + 1]));
  return { ...doc, lines: doc.lines.map((l) => ({ ...l, order: rank.get(l.id) })) };
}

// התצוגה המלאה: העמוד המקורי + כל הפעולות לפי הסדר, ממוין בסדר-קריאה.
// מסגרות שנערכו כאן (frames_confirmed קיים — frames_set/frames_clear) קובעות
// גם את סדר-הקריאה, כמו אצלם בפריסה ידנית; מסגרות שהגיעו עם העמוד כבר
// מגולמות ב-order שיובא ואינן מסדרות אותו מחדש. _text0 = הטקסט שיובא
// (applyText: "תוקנה" רק כשהטקסט שונה ממנו).
export function buildView(baseDoc, ops = []) {
  let doc = {
    ...baseDoc,
    lines: (baseDoc.lines || []).map((l) => ({
      ...l,
      _auto: { stream: l.stream, stream_src: l.stream_src },
      _text0: String(l.text ?? l.text_ocr ?? ''),
    })),
  };
  ops.forEach((op, i) => {
    doc = applyOp(doc, op, i);
  });
  doc = applyFrameStreams(doc);
  if (typeof doc.frames_confirmed === 'boolean') doc = applyFrameOrder(doc);
  doc.lines = doc.lines.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return doc;
}

// ---------- מסגרות מקומיות ----------

// הריפוד (פיקסלי-תמונה) של מסגרת שמתהדקת לטקסט — במסגרת שצוירה, שהוזזה או ששונה
// גודלה, וגם בהצעת המחשב: מסגרת "צמודה לטקסט", רק עם מרווח קטן כדי שקו המסגרת לא
// יעלה על האותיות (ושורה שבתוכה תיחשב "כולה בפנים" — הסובלנות אצלם פיקסל אחד)
export const FRAME_PAD = 4;

// הצמדת מסגרת לטקסט שבתוכה (כמו snap אצלם — כיווץ בלבד): איחוד תיבות
// השורות שמרכזן בתוך המלבן, עם ריפוד קטן — ולעולם לא מעבר למה שהמשתמש צייר.
// אין שורה שמרכזה בפנים — המלבן כמות-שהוא.
export function snapFrame(bbox, lines, pad = FRAME_PAD) {
  if (!isBox(bbox)) return bbox;
  const cx = (b) => (b[0] + b[2]) / 2;
  const cy = (b) => (b[1] + b[3]) / 2;
  const hit = (lines || []).filter(
    (l) => l && isBox(l.bbox) && l.status !== 'removed' && cx(l.bbox) >= bbox[0] && cx(l.bbox) <= bbox[2] && cy(l.bbox) >= bbox[1] && cy(l.bbox) <= bbox[3]
  );
  if (!hit.length) return bbox;
  const u = union(hit.map((l) => l.bbox));
  return [
    Math.max(bbox[0], u[0] - pad),
    Math.max(bbox[1], u[1] - pad),
    Math.min(bbox[2], u[2] + pad),
    Math.min(bbox[3], u[3] + pad),
  ];
}

// ---------- "מסגרות מהזיהוי" (הצעת המחשב) ----------

// האלגוריתם עצמו — autoFrames.js (טורים לפי כיסוי, כותרות, רצועות, סדר-קריאה);
// כאן רק הייצוא מהמקום הישן, למי שמייבא מ-ops.
export { autoFrames } from './autoFrames.js';

// ---------- דחיסה לפני הגשה ----------

// סוגים שבהם הפעולה האחרונה על אותו יעד קובעת לבד (החלפה מלאה של השדה).
// text מטופל בנפרד (ראו compactOps); styles ו-para_break — הפעלה/כיבוי, הסדר חשוב.
const LAST_WINS = new Set([
  'stream', 'para', 'para_start', 'script', 'status', 'bbox',
  'page_type', 'mixed_line', 'certainty', 'train_text', 'line_ok', 'frames_set', 'cut_ok',
]);
const PAGE_LEVEL = new Set(['frames_set', 'page_type', 'cut_ok']);

function compactKey(op) {
  if (PAGE_LEVEL.has(op.kind)) return op.kind;
  if (op.kind === 'frame_seq') return `frame_seq|${op.value?.fid}`;
  if (!LAST_WINS.has(op.kind)) return null;
  return `${op.kind}|${(op.ids || []).join(',')}`;
}

// שורות שהפעולה מתייחסת למספרי-המילים שלהן (ולכן תלויה בטקסט שלפניה)
function wordIndexedLines(op) {
  if (op.kind === 'styles' || op.kind === 'para_break') return op.ids || [];
  if (op.kind === 'link_add') {
    const out = [];
    if (op.value?.from_words) out.push(op.ids?.[0]);
    if (op.value?.to_words) out.push(op.ids?.[1]);
    return out;
  }
  return [];
}

// מסיר פעולות שנדרסו ע"י פעולה מאוחרת על אותו יעד, ותיקונים שחזרו למקור.
// מצב-הסיום זהה, ורשומת-האמת אצלם נקייה מ"הלוך-ושוב".
// תיקון-טקסט נדרס ע"י תיקון-טקסט מאוחר באותה שורה — אלא אם ביניהם יש פעולה
// שמספרי-המילים שלה מתייחסים לטקסט שלו (סגנון-תו, פסקה באמצע שורה, קישור
// ברמת-מילה): בלעדיו המספרים שלה היו מצביעים על מילים אחרות. תיקון שאינו
// משנה דבר (זהה לטקסט שלפניו ברשימה הדחוסה) יורד.
export function compactOps(baseDoc, ops) {
  const lastIdx = new Map();
  ops.forEach((op, i) => {
    const k = compactKey(op);
    if (k) lastIdx.set(k, i);
  });

  const supersededText = new Set();
  const laterText = new Set();
  const wordRefSince = new Set();
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    if (op.kind === 'text') {
      const id = (op.ids || [])[0];
      if (laterText.has(id) && !wordRefSince.has(id)) supersededText.add(i);
      laterText.add(id);
      wordRefSince.delete(id);
    } else {
      for (const id of wordIndexedLines(op)) wordRefSince.add(id);
    }
  }

  const lines = lineMap(baseDoc);
  const curText = new Map();
  const out = ops.filter((op, i) => {
    const k = compactKey(op);
    if (k && lastIdx.get(k) !== i) return false;
    const id = (op.ids || [])[0];
    const l = lines.get(id);
    if (op.kind === 'text') {
      if (supersededText.has(i)) return false;
      const before = curText.has(id) ? curText.get(id) : l ? (l.text ?? l.text_ocr ?? '') : undefined;
      if (op.value === before) return false;
      curText.set(id, op.value);
      return true;
    }
    if (op.kind === 'status' && op.value === 'restore' && l && l.status !== 'removed') return false;
    return true;
  });
  // manual:true נשלח רק בעריכה הראשונה של ההצעה; frames_set מאוחר "דורס" אותה —
  // בלי להעביר את הדגל העמוד היה נשאר אצלם במצב "מסגרות מתקנות"
  const manual = ops.some((op) => op?.kind === 'frames_set' && op.value?.manual === true);
  return manual
    ? out.map((op) => (op.kind === 'frames_set' && op.value?.manual !== true ? { ...op, value: { ...op.value, manual: true } } : op))
    : out;
}

// ---------- הסדר שתוכנת-הספר צריכה ----------

// אצלם פעולת-טקסט אינה מיישרת את מה שכבר שמור לפי מספרי-מילים (סגנונות-תו,
// פסקה באמצע שורה, טווחי-קישור) — הם נשארים על אותם מספרים. באתר כל פעולה
// כזו מתייחסת לטקסט של השורה *ברגע שנעשתה*, ותיקון מאוחר מזיז אותה (applyText).
// לכן לפני השמירה: לכל שורה (בלי פעולות-חיתוך) — רק הטקסט הסופי, מוקדם לפני
// כל פעולות-המילים שלה, והמספרים שלהן מתורגמים לטקסט הסופי באותו יישור של
// התצוגה. התוצאה בתצוגה זהה; אצלם — הסגנון והפסקה נופלים על אותן מילים.
//   • פסקה שהגבול שלה עבר לתחילת השורה ← para_start 1 (כמו בתצוגה);
//   • סגנון/גבול שכל מילותיו נמחקו — יורד; קצה-קישור כזה — הקישור נשאר ברמת-שורה;
//   • טקסט סופי שזהה לטקסט שיובא — יורד (אצלם כתיבה כזו הייתה מסמנת "ok").
export function bookOrder(baseDoc, ops) {
  const list = Array.isArray(ops) ? ops : [];
  const base = lineMap(baseDoc);
  const cutIds = new Set();
  for (const op of list) if (RECUT_ID_KINDS.has(op?.kind)) for (const id of op.ids || []) cutIds.add(id);

  const chains = new Map();
  list.forEach((op, i) => {
    if (op?.kind !== 'text') return;
    const id = op.ids?.[0];
    if (!base.has(id) || cutIds.has(id)) return;
    if (!chains.has(id)) {
      const l = base.get(id);
      chains.set(id, { at: [], texts: [String(l.text ?? l.text_ocr ?? '')] });
    }
    const c = chains.get(id);
    c.at.push(i);
    c.texts.push(String(op.value ?? ''));
  });
  if (!chains.size) return list.slice();
  for (const c of chains.values()) {
    c.steps = [];
    for (let s = 0; s + 1 < c.texts.length; s++) c.steps.push(realignWords(c.texts[s], null, c.texts[s + 1]));
  }
  // מאיזה צעד בשרשרת מתחילה פעולה שבמקום p (כמה תיקוני-טקסט של השורה היו לפניה)
  const from = (c, p) => c.at.filter((i) => i < p).length;
  const toFinalRange = (id, p, r) => {
    const c = chains.get(id);
    if (!c) return r;
    let cur = r;
    for (let s = from(c, p); s < c.steps.length && cur; s++) cur = remapRange(cur, c.steps[s].src);
    return cur;
  };
  // פסקאות באמצע שורה: הדלקה וכיבוי באותה מילה, וגבול שעובר לתחילת השורה
  // (ונהיה para_start), אינם מתורגמים אחד-אחד בלי לאבד מידע. לכן לכל שורה
  // מדמים את מצב-הגבולות כמו התצוגה — פעם עם פעולות-הגבול של המתנדב ופעם
  // בלעדיהן — ושולחים רק את ההפרש, במספרי-המילים של הטקסט הסופי.
  const lastBreak = new Map();
  list.forEach((op, i) => {
    if (op?.kind === 'para_break' && chains.has(op.ids?.[0])) lastBreak.set(op.ids[0], i);
  });
  const netBreaks = (id, page) => {
    const l = base.get(id);
    const c = chains.get(id);
    const sim = (withBreaks) => {
      let S = new Set((l.para_breaks || []).filter((b) => isInt(b) && b >= 0));
      let P = !!l.para_start;
      let step = 0;
      for (const op of list) {
        if (!op || !Array.isArray(op.ids) || !op.ids.includes(id)) continue;
        if (op.kind === 'text') {
          const map = c.steps[step++]?.map || [];
          const next = new Set();
          for (const b of S) {
            const k = remapBreak(b, map);
            if (k === 0) P = true;
            else if (k > 0) next.add(k);
          }
          S = next;
        } else if (op.kind === 'para_break' && withBreaks && op.value) {
          if (op.value.on) S.add(op.value.word);
          else S.delete(op.value.word);
        } else if (op.kind === 'para_start') {
          P = !!op.value;
          S.delete(0);
        }
      }
      return { S, P };
    };
    const a = sim(true);
    const b = sim(false);
    const out = [];
    if (a.P !== b.P) out.push({ kind: 'para_start', page, ids: [id], value: a.P ? 1 : 0 });
    const brk = (word, on) => ({ kind: 'para_break', page, ids: [id], value: { word, on } });
    const ok = (w) => w >= 1 && w <= MAX_BREAK_WORD;
    for (const w of [...a.S].filter((w) => !b.S.has(w) && ok(w)).sort((x, y) => x - y)) out.push(brk(w, true));
    for (const w of [...b.S].filter((w) => !a.S.has(w) && ok(w)).sort((x, y) => x - y)) out.push(brk(w, false));
    return out;
  };

  // העוגן של כל שורה: הפעולה הראשונה שנוגעת בטקסט שלה או במספרי-המילים שלה
  const anchor = new Map();
  for (const [id, c] of chains) anchor.set(id, c.at[0]);
  list.forEach((op, i) => {
    for (const id of wordIndexedLines(op)) if (chains.has(id) && i < anchor.get(id)) anchor.set(id, i);
  });
  const emitAt = new Map();
  for (const [id, p] of anchor) {
    const c = chains.get(id);
    const last = list[c.at[c.at.length - 1]];
    if (c.texts[c.texts.length - 1] === c.texts[0]) continue;
    if (!emitAt.has(p)) emitAt.set(p, []);
    emitAt.get(p).push(last);
  }

  const out = [];
  list.forEach((op, i) => {
    for (const t of emitAt.get(i) || []) out.push(t);
    const id = op?.ids?.[0];
    if (op?.kind === 'text' && chains.has(id)) return;
    if (op?.kind === 'styles' && op.value && Array.isArray(op.ids)) {
      if (!op.ids.some((x) => chains.has(x))) return out.push(op);
      // פעולה על כמה שורות — כל שורה לפי הטקסט שלה
      for (const x of op.ids) {
        const words = toFinalRange(x, i, op.value.words);
        if (words) out.push({ ...op, ids: [x], value: { ...op.value, words } });
      }
      return undefined;
    }
    if (op?.kind === 'para_break' && chains.has(id)) {
      // כל פעולות-הגבול של השורה ← ההפרש הנקי, במקום האחרונה שבהן
      if (lastBreak.get(id) === i) out.push(...netBreaks(id, op.page));
      return undefined;
    }
    if (op?.kind === 'link_add' && op.value && typeof op.value === 'object' && (chains.has(op.ids?.[0]) || chains.has(op.ids?.[1]))) {
      const value = { ...op.value };
      for (const [key, x] of [
        ['from_words', op.ids[0]],
        ['to_words', op.ids[1]],
      ]) {
        if (!Array.isArray(value[key])) continue;
        const r = toFinalRange(x, i, value[key]);
        if (r) value[key] = r;
        else delete value[key];
      }
      return out.push({ ...op, value });
    }
    return out.push(op);
  });
  return out;
}

// כל אישורי-השורה של ההגשה (אישור פסקה שולח line_ok לכל שורה) — בסוף, ברשימה
// אחת בחלקים של עד MAX_IDS_PER_OP שורות. אצלם כל פעולה = ניתוח-מחדש של העמוד,
// ולקובץ-תיקונים יש תקרה (5,000 פעולות) — ספר שלם של line_ok בודדים חצה אותה.
// line_ok אינו תלוי בסדר (הוא מאשר את הטקסט הסופי). שורה שפעולת-חיתוך נוגעת
// בה תיקרא מחדש — האישור שלה חסר-משמעות ויורד.
export function mergeLineOk(baseDoc, ops, size = MAX_IDS_PER_OP) {
  const list = Array.isArray(ops) ? ops : [];
  const cutIds = new Set(recutLineIds(baseDoc, list));
  const rest = [];
  const ids = [];
  const seen = new Set();
  let page;
  let any = false;
  for (const op of list) {
    if (op?.kind !== 'line_ok') {
      rest.push(op);
      continue;
    }
    any = true;
    page = op.page;
    for (const id of op.ids || []) {
      if (seen.has(id) || cutIds.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  if (!any) return list.slice();
  for (let i = 0; i < ids.length; i += size) rest.push({ kind: 'line_ok', page, ids: ids.slice(i, i + size) });
  return rest;
}

// מה שנשמר בהגשה ויוצא בקובץ-התיקונים: הסדר של תוכנת-הספר ← דחיסה ← איחוד
// אישורי-השורות. bookOrder רץ על הרשימה המלאה (עם כל גרסאות-הביניים של הטקסט
// — היישור עובר דרכן, כמו בתצוגה) ומשאיר לכל שורה רק את הטקסט הסופי.
export function packOps(baseDoc, ops) {
  return mergeLineOk(baseDoc, compactOps(baseDoc, bookOrder(baseDoc, ops)));
}

// ---------- חיתוך וזיהוי-מחדש ----------

// פעולות-חיתוך שנוגעות בשורות קיימות (line_add יוצרת שורה חדשה, בלי ids)
const RECUT_ID_KINDS = new Set(['line_split', 'line_merge', 'bbox']);

// האם הרשימה משנה את חיתוך-השורות — ואז, אחרי אישור, העמוד חוזר לתוכנת-הספר
// לחיתוך ולזיהוי-מחדש ('recut') לפני מעבר שני באתר
export function needsRecut(ops) {
  return (ops || []).some((op) => CUT_KINDS.includes(op?.kind));
}

// מזהי השורות *המקוריות* (מהעמוד שיובא) שפעולות-חיתוך נוגעות בהן — פיצול,
// איחוד, שינוי-תיבה. בעורך הטקסט שלהן נעול ("ממתינה לזיהוי מחדש"): הן ייקראו
// שוב, והקלדה בהן לשווא. ממוין, בלי כפילויות.
export function recutLineIds(baseDoc, ops) {
  const base = new Set((baseDoc?.lines || []).map((l) => l?.id));
  const out = new Set();
  for (const op of ops || []) {
    if (!RECUT_ID_KINDS.has(op?.kind)) continue;
    for (const id of op.ids || []) {
      if (isInt(id) && (base.size ? base.has(id) : id > 0)) out.add(id);
    }
  }
  return [...out].sort((a, b) => a - b);
}

// ---------- "לספר בלבד" (train_text) ----------

// מצב "לספר בלבד" בעורך: כל עוד הוא דולק, כל תיקון-טקסט בשורה מקורית (מזהה חיובי
// מהעמוד שיובא) שעוד אינה מסומנת — מקבל באותו push גם {kind:'train_text', value:0}.
// שורה שסומנה בנוסח הישן ("פגם בדפוס" — vocab.isPrintDefect) כבר מסומנת. ריהוט (כותרת
// עמוד, תחתית, מפריד — לשונית הריהוט) אינו מסומן: הוא אינו נכנס לספר.
// הפעולה הנלווית מסומנת _cmp (שדה-פנים): useProofEditor שם אותה באותו צעד-ביטול של
// ההקלדה, וצבירת-ההקלדה ממשיכה לעבוד. תיקון שאינו משנה את הטקסט — בלי סימון; אישור
// בלי שינוי (line_ok) — בלי סימון (החלטת בעל הפרויקט, 2026-10-02).
// list = הארגומנטים של push (פעולות, ואולי אפשרויות בסוף); view = התצוגה הנוכחית.
export function withBookOnly(list, view, page) {
  const args = Array.isArray(list) ? list : [];
  const lines = lineMap(view);
  const marked = new Set();
  const out = [];
  for (const op of args) {
    const id = op && typeof op === 'object' && op.kind === 'text' && !op._local && Array.isArray(op.ids) && op.ids.length === 1 ? op.ids[0] : null;
    const l = id != null ? lines.get(id) : null;
    if (
      l &&
      isInt(id) &&
      id > 0 &&
      !l._new &&
      !isBookOnly(l) &&
      !isFurnitureStream(l.stream) &&
      !marked.has(id) &&
      String(op.value ?? '') !== String(l.text ?? l.text_ocr ?? '')
    ) {
      marked.add(id);
      out.push({ kind: 'train_text', page: op.page ?? page, ids: [id], value: 0, _cmp: true });
    }
    out.push(op);
  }
  return out;
}

// הטקסט הסופי של כל שורה לפי רשימת-הפעולות (רק מה שתיקוני-הטקסט קבעו)
function finalTexts(ops) {
  const out = new Map();
  for (const op of ops || []) if (op?.kind === 'text' && op.ids?.length === 1) out.set(op.ids[0], String(op.value ?? ''));
  return out;
}

// סימון אוטומטי (_cmp) על שורה שהטקסט שלה חזר בסוף לזה שיובא — יורד לפני ההגשה:
// "לספר בלבד" מסמן רק שורות שהטקסט בהן *השתנה*. סימון ידני (לוח הפרטים) — נשאר.
export function dropIdleBookOnly(baseDoc, ops) {
  const list = Array.isArray(ops) ? ops : [];
  if (!list.some((o) => o?._cmp)) return list;
  const base = lineMap(baseDoc);
  const fin = finalTexts(list);
  return list.filter((o) => {
    if (!o?._cmp || o.kind !== 'train_text') return true;
    const id = o.ids?.[0];
    const l = base.get(id);
    return !!l && fin.has(id) && fin.get(id) !== String(l.text ?? l.text_ocr ?? '');
  });
}

// הנוסח הישן של "לספר בלבד": פעולת-ודאות של הכפתור "פגם בדפוס" (2026-10-01) — "לא בטוח" עם הסיבה
// הקבועה (vocab.PRINT_DEFECT_WHY). עדיין יכולה להגיע מטיוטה או מהגשה מלפני "לספר בלבד"
export const isPrintDefectOp = (op) => op?.kind === 'certainty' && isPrintDefect({ certainty: op.value?.v, certainty_why: op.value?.why });

// השורות שיסומנו "לספר בלבד" בהגשה — לחלון ההגשה ולמסך הסקירה של המנהל. כמו isBookOnly בשורה:
// train_text = 0, או הנוסח הישן (ודאות "פגם בדפוס"); לכל אחד מהשדות הפעולה האחרונה לשורה קובעת
export function bookOnlyLineIds(ops) {
  const train = new Map();
  const legacy = new Map();
  const seen = new Set();
  for (const op of ops || []) {
    if (op?.kind !== 'train_text' && op?.kind !== 'certainty') continue;
    for (const id of op.ids || []) {
      seen.add(id);
      if (op.kind === 'train_text') train.set(id, op.value);
      else legacy.set(id, isPrintDefectOp(op));
    }
  }
  return [...seen].filter((id) => train.get(id) === 0 || legacy.get(id));
}

// ---------- תיאור ----------

const cut = (s, n = 40) => {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n) + '…' : t;
};

// תיאור קצר בעברית של פעולה (לרשימת-השינויים ולמסך האישור)
export function describeOp(doc, op) {
  const lines = lineMap(doc);
  const nos = (op.ids || [])
    .slice(0, 6)
    .map((i) => {
      const l = lines.get(i);
      return l ? (l.line_no ?? 0) + 1 : '?';
    })
    .join(', ');
  const where = op.ids?.length ? `שורה ${nos}${op.ids.length > 6 ? '…' : ''}: ` : '';
  const kindHe = OP_KINDS[op.kind]?.he || op.kind;
  const v = op.value;
  switch (op.kind) {
    case 'text': {
      const l = lines.get(op.ids[0]);
      return `${where}«${cut(l?.text ?? l?.text_ocr)}» ← «${cut(v)}»`;
    }
    case 'stream':
      // שם הזרם בעברית (לא המפתח): "הערות", "כותרת הערות"; ריהוט — ולאן הוא הולך
      return `${where}זרם ← ${streamName(doc, v)}${isFurnitureStream(v) ? ` (${FURNITURE_TAB_HE} — לא נכנס לספר)` : ''}`;
    case 'para':
      return `${where}סגנון-פסקה ← ${PARA_STYLES[v]?.he || v}`;
    case 'para_start':
      return `${where}${v ? 'תחילת פסקה' : 'לא תחילת פסקה'}`;
    case 'para_break':
      return `${where}${v.on ? 'פסקה חדשה מהמילה' : 'ביטול הפסקה שמתחילה במילה'} ${v.word + 1}`;
    case 'script':
      return `${where}כתב ← ${SCRIPTS[v] || v}`;
    case 'styles':
      return `${where}${CHAR_STYLES[v.style]?.he || v.style} ${v.on ? 'הוספה' : 'הסרה'} (מילים ${v.words[0] + 1}–${v.words[1] + 1})`;
    case 'status':
      return `${where}${v === 'removed' ? 'לא-שורה (הוסרה)' : 'שחזור'}`;
    case 'bbox':
      return `${where}תיבה חדשה`;
    case 'page_type':
      return `סוג-עמוד ← ${PAGE_TYPES[v] || v}`;
    case 'frames_set':
      return `מסגרות: ${v.frames.length}${v.confirmed ? ' (אושרו כמות-שהן)' : ''}`;
    case 'frame_seq':
      return `מסגרת ${v.fid}: מספר ${v.seq} בזרם`;
    case 'cut_ok':
      return 'חיתוך השורות בעמוד נבדק ונמצא תקין';
    case 'link_add': {
      if (!v) return `${where}קישור ידני`;
      const words = (r) => (Array.isArray(r) ? (r[0] === r[1] ? `מילה ${r[0] + 1}` : `מילים ${r[0] + 1}–${r[1] + 1}`) : '—');
      const range = v.from_words || v.to_words ? ` (${words(v.from_words)} ← ${words(v.to_words)})` : '';
      const what = `קישור ${v.kind === 'dh' ? 'דיבור-המתחיל' : 'הערה'}${range}`;
      // צד בעמוד אחר: "שורה 3 ← עמוד 4, שורה 12 «…»" (המזהה הזר אינו שורה כאן — בלי '?')
      const far = farLinkSide(doc.page, v);
      if (!far) return `${where}${what}`;
      const here = lines.get(op.ids?.[1 - far.index]);
      const farEnd = `עמוד ${far.page}, שורה ${far.lineNo != null ? far.lineNo + 1 : op.ids?.[far.index]}${far.text ? ` «${cut(far.text, 32)}»` : ''}`;
      const hereEnd = `שורה ${here ? (here.line_no ?? 0) + 1 : '?'}`;
      return `${far.index === 0 ? `${farEnd} ← ${hereEnd}` : `${hereEnd} ← ${farEnd}`}: ${what}`;
    }
    case 'link_ok':
    case 'link_del':
    case 'link_reset': {
      const l = lines.get(v.src_line);
      return `${kindHe} (שורה ${l ? (l.line_no ?? 0) + 1 : '?'})`;
    }
    case 'mixed_line':
      return `${where}${v ? 'שורה מעורבת-כתבים' : 'לא מעורבת'}`;
    case 'certainty':
      // הנוסח הישן של "לספר בלבד" (הכפתור "פגם בדפוס") — מתואר כ"לספר בלבד", כמו שהוא נקרא
      if (isPrintDefectOp(op)) return `${where}פגם בדפוס — נכנס לספר, לא לאימון`;
      return `${where}${CERTAINTY[v.v]}${v.why ? ` — ${cut(v.why, 60)}` : ''}`;
    case 'train_text':
      return `${where}${v === 0 ? 'פגם בדפוס — נכנס לספר, לא לאימון' : 'חזרה לאימון (בלי "פגם בדפוס")'}`;
    case 'line_split':
      return `${where}פיצול בנקודה x=${v.x}`;
    case 'line_merge':
      return `${where}איחוד לשורה אחת`;
    case 'line_add':
      return `שורה חדשה${v.text ? ` «${cut(v.text)}»` : ''}`;
    default:
      return `${where}${kindHe}`;
  }
}
