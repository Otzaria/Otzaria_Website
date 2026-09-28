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
} from './vocab.js';

export const MAX_OPS = 3000;
export const MAX_TEXT = 2000;
export const MAX_FRAMES = 60;
const MAX_WHY = 300;
const FID_RE = /^[A-Za-z0-9]{4,32}$/;

const isInt = (v) => Number.isInteger(v);
const lineMap = (doc) => new Map((doc?.lines || []).map((l) => [l.id, l]));

function checkBox(bb, doc) {
  if (!Array.isArray(bb) || bb.length !== 4 || !bb.every(isInt)) return 'תיבה חייבת להיות ארבעה מספרים שלמים';
  const [x0, y0, x1, y1] = bb;
  if (x1 <= x0 || y1 <= y0) return 'תיבה לא תקינה (רוחב או גובה אפסי)';
  const [w, h] = Array.isArray(doc?.size) ? doc.size : [0, 0];
  if (x0 < 0 || y0 < 0 || (w && x1 > w) || (h && y1 > h)) return 'התיבה חורגת מגבולות התמונה';
  return null;
}

// בודק פעולה אחת מול העמוד המקורי (כפי שיובא). מחזיר הודעת שגיאה בעברית או null.
// ids חייבים להיות שורות קיימות בעמוד — אין פעולות על שורות שנוצרו מקומית
// (פיצול/הוספה): תוכנת-הספר עוד לא קולטת אותן, והמזהים שלהן אינם שלה.
export function validateOp(doc, op) {
  if (!op || typeof op !== 'object') return 'פעולה לא תקינה';
  const spec = OP_KINDS[op.kind];
  if (!spec) return `סוג-פעולה לא מוכר: ${op.kind}`;
  if (op.page !== doc.page) return `הפעולה שייכת לעמוד ${op.page} ולא לעמוד ${doc.page}`;

  const lines = lineMap(doc);
  const ids = op.ids;
  if (spec.ids) {
    if (!Array.isArray(ids) || !ids.length) return 'לא נבחרו שורות';
    if (ids.length > 500) return 'יותר מדי שורות בפעולה אחת';
    if (!ids.every((i) => isInt(i) && lines.has(i))) return 'שורה שאינה בעמוד הזה';
    if (new Set(ids).size !== ids.length) return 'שורה כפולה בפעולה';
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
      const w = v.words;
      if (!Array.isArray(w) || w.length !== 2 || !w.every((n) => isInt(n) && n >= 0) || w[0] > w[1])
        return 'טווח-מילים לא תקין';
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
      return checkBox(v, doc) || (ids.length === 1 ? null : 'תיבה היא לשורה אחת');
    case 'page_type':
      return Object.hasOwn(PAGE_TYPES, v) ? null : `סוג-עמוד לא מוכר: ${v}`;
    case 'frames_set': {
      const frames = v?.frames;
      if (!Array.isArray(frames)) return 'רשימת מסגרות חסרה';
      if (frames.length > MAX_FRAMES) return 'יותר מדי מסגרות';
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
    case 'link_add':
      return ids.length === 2 ? null : 'קישור ידני דורש בדיוק שתי שורות';
    case 'link_ok':
    case 'link_del': {
      if (!v || !isInt(v.src_line) || !lines.has(v.src_line)) return 'שורת-המקור של הקישור חסרה';
      if (v.page !== doc.page) return 'עמוד הקישור שגוי';
      return null;
    }
    case 'certainty':
      if (!v || !Object.hasOwn(CERTAINTY, v.v)) return 'ערך-ודאות לא מוכר';
      return v.why == null || (typeof v.why === 'string' && v.why.length <= MAX_WHY) ? null : 'הסבר ארוך מדי';
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
      const e = checkBox(v?.bbox, doc);
      if (e) return e;
      if (v.text != null && (typeof v.text !== 'string' || v.text.length > MAX_TEXT)) return 'טקסט לא תקין';
      if (v.stream != null && !isStreamKey(v.stream)) return 'זרם לא מוכר';
      return null;
    }
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

// ---------- החלה מקומית ----------

const union = (boxes) => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];

const inside = (bb, fb, tol = 3) =>
  bb[0] >= fb[0] - tol && bb[1] >= fb[1] - tol && bb[2] <= fb[2] + tol && bb[3] <= fb[3] + tol;

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
      return mapLines(doc, ids, (l) => ({ ...l, para_start: !!v, _touched: true }));
    case 'script':
      return mapLines(doc, ids, (l) => ({ ...l, script: v, _touched: true }));
    case 'styles':
      return mapLines(doc, ids, (l) => toggleStyle(l, v.style, v.words, v.on));
    case 'text':
      // אחרי תיקון, סימוני-המילים (הצעות, חשד מודל-שפה, ביטחון נמוך) כבר לא
      // מתאימים לטקסט — מוסתרים, כמו בתוכנת-הספר
      return mapLines(doc, ids, (l) => ({
        ...l,
        text: v,
        status: v === (l.text_ocr ?? '') ? 'ok' : 'fixed',
        alternatives: [],
        lm_flags: [],
        flags: { ...(l.flags || {}), low_words: [] },
        _textEdited: true,
      }));
    case 'status':
      return mapLines(doc, ids, (l) =>
        v === 'removed'
          ? { ...l, status: 'removed', _prevStatus: l.status === 'removed' ? l._prevStatus : l.status }
          : { ...l, status: l._prevStatus || (l.status === 'removed' ? 'ok' : l.status) }
      );
    case 'bbox':
      return mapLines(doc, ids, (l) => ({ ...l, bbox: v, polygon: null, _touched: true }));
    case 'page_type':
      return { ...doc, page_type: v, page_type_src: 'human' };
    case 'frames_set':
      return { ...doc, frames: v.frames.map((f) => ({ ...f, seq: f.seq ?? keepSeq(doc, f.fid) })) };
    case 'frames_clear':
      return { ...doc, frames: [] };
    case 'frames_auto':
      return doc; // מחושב בתוכנת-הספר; העורך שולח במקומו frames_set מקומי
    case 'frame_seq':
      return { ...doc, frames: (doc.frames || []).map((f) => (f.fid === v.fid ? { ...f, seq: v.seq } : f)) };
    case 'link_add': {
      const links = (doc.links || []).filter((k) => k.from_line !== ids[0]);
      links.push({ from_line: ids[0], from_mark: null, to_line: ids[1], to_page: doc.page, kind: 'note', conf: 1, src: 'human', suspect: null });
      return { ...doc, links };
    }
    case 'link_ok':
      return { ...doc, links: (doc.links || []).map((k) => (k.from_line === v.src_line ? { ...k, src: 'human', suspect: null } : k)) };
    case 'link_del':
      return { ...doc, links: (doc.links || []).filter((k) => k.from_line !== v.src_line) };
    case 'mixed_line':
      return mapLines(doc, ids, (l) => ({ ...l, flags: { ...(l.flags || {}), mixed_line: !!v }, _touched: true }));
    case 'certainty':
      return mapLines(doc, ids, (l) => ({ ...l, certainty: v.v, certainty_why: v.why ?? null }));
    case 'line_ok':
      return mapLines(doc, ids, (l) => ({ ...l, _ok: true, status: l.status === 'pending' ? 'ok' : l.status }));
    case 'line_split': {
      const lines = [];
      for (const l of doc.lines) {
        if (l.id !== ids[0]) {
          lines.push(l);
          continue;
        }
        const [x0, y0, x1, y1] = l.bbox;
        // עברית: החצי הימני קודם בסדר-הקריאה
        const right = { ...blankLine(l), id: tempLineId(opIndex, 0), bbox: [v.x, y0, x1, y1], order: l.order };
        const left = { ...blankLine(l), id: tempLineId(opIndex, 1), bbox: [x0, y0, v.x, y1], order: l.order + 0.5 };
        lines.push(right, left);
      }
      return { ...doc, lines };
    }
    case 'line_merge': {
      const [a, b] = ids.map((i) => doc.lines.find((l) => l.id === i));
      const first = a.order <= b.order ? a : b;
      const second = first === a ? b : a;
      const merged = {
        ...blankLine(first),
        id: tempLineId(opIndex, 0),
        bbox: union([a.bbox, b.bbox]),
        order: first.order,
        text: [first.text, second.text].filter(Boolean).join(' '),
      };
      return { ...doc, lines: doc.lines.filter((l) => l !== a && l !== b).concat(merged) };
    }
    case 'line_add': {
      const nl = {
        ...blankLine(null),
        id: tempLineId(opIndex, 0),
        bbox: v.bbox,
        text: v.text || '',
        stream: v.stream || 'main',
        stream_src: 'human',
        order: orderForNewLine(doc, v.bbox),
      };
      return { ...doc, lines: doc.lines.concat(nl) };
    }
    default:
      return doc;
  }
}

function keepSeq(doc, fid) {
  return (doc.frames || []).find((f) => f.fid === fid)?.seq ?? null;
}

// שורה שנוצרה מקומית (פיצול/איחוד/הוספה): נעולה לעריכה נוספת עד הקליטה
function blankLine(src) {
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
    pred: {},
    flags: {},
    certainty: null,
    alternatives: [],
    lm_flags: [],
    _new: true,
  };
}

// סדר-קריאה לשורה חדשה: אחרי השורה שמעליה (לפי מרכז אנכי) — קירוב לתצוגה בלבד
function orderForNewLine(doc, bb) {
  const cy = (bb[1] + bb[3]) / 2;
  const above = doc.lines.filter((l) => l.bbox && (l.bbox[1] + l.bbox[3]) / 2 <= cy);
  if (!above.length) return 0.5;
  return Math.max(...above.map((l) => l.order || 0)) + 0.5;
}

// זרם-מהמסגרת: שורה שכולה בתוך מסגרת-טקסט מקבלת את זרם המסגרת, אלא אם
// נקבע לה זרם ביד (human). כמו strict_where אצלם — שורה שבולטת החוצה לא נספרת.
function applyFrameStreams(doc) {
  const textFrames = (doc.frames || []).filter((f) => !f.kind);
  return {
    ...doc,
    lines: doc.lines.map((l) => {
      if (l.stream_src === 'human' || !l.bbox) return l;
      const f = textFrames.find((fr) => inside(l.bbox, fr.bbox));
      if (f) return { ...l, stream: f.stream, stream_src: 'frame' };
      return l._auto ? { ...l, stream: l._auto.stream, stream_src: l._auto.stream_src } : l;
    }),
  };
}

// התצוגה המלאה: העמוד המקורי + כל הפעולות לפי הסדר, ממוין בסדר-קריאה
export function buildView(baseDoc, ops = []) {
  let doc = {
    ...baseDoc,
    lines: (baseDoc.lines || []).map((l) => ({ ...l, _auto: { stream: l.stream, stream_src: l.stream_src } })),
  };
  ops.forEach((op, i) => {
    doc = applyOp(doc, op, i);
  });
  doc = applyFrameStreams(doc);
  doc.lines = doc.lines.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return doc;
}

// ---------- מסגרות מקומיות ----------

// הצמדת מסגרת לטקסט שבתוכה (כמו snap אצלם — כיווץ בלבד): איחוד תיבות
// השורות שמרכזן בתוך המלבן שצויר, עם ריפוד קטן
export function snapFrame(bbox, lines, pad = 4) {
  const cx = (b) => (b[0] + b[2]) / 2;
  const cy = (b) => (b[1] + b[3]) / 2;
  const hit = lines.filter(
    (l) => l.bbox && l.status !== 'removed' && cx(l.bbox) >= bbox[0] && cx(l.bbox) <= bbox[2] && cy(l.bbox) >= bbox[1] && cy(l.bbox) <= bbox[3]
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

// "מסגרות מהזיהוי" — נקודת-פתיחה מקומית: לכל זרם-תוכן, אשכול השורות לטורים
// לפי חפיפה אופקית, ומסגרת לכל טור. seq בזרם: מימין לשמאל (עברית).
export function autoFrames(doc, newFid) {
  const lines = (doc.lines || []).filter(
    (l) => l.bbox && l.status !== 'removed' && !['header', 'footer', 'sep'].includes(String(l.stream).replace(/_heading$/, ''))
  );
  const byStream = new Map();
  for (const l of lines) {
    const s = String(l.stream || 'main').replace(/_heading$/, '');
    if (!byStream.has(s)) byStream.set(s, []);
    byStream.get(s).push(l);
  }
  const frames = [];
  const taken = new Set();
  for (const [stream, ls] of byStream) {
    const cols = [];
    for (const l of ls.slice().sort((a, b) => b.bbox[2] - a.bbox[2])) {
      const w = l.bbox[2] - l.bbox[0];
      const col = cols.find((c) => {
        const ov = Math.min(c.box[2], l.bbox[2]) - Math.max(c.box[0], l.bbox[0]);
        return ov > 0.5 * Math.min(w, c.box[2] - c.box[0]);
      });
      if (col) {
        col.box = union([col.box, l.bbox]);
      } else {
        cols.push({ box: l.bbox.slice() });
      }
    }
    cols.sort((a, b) => b.box[2] - a.box[2]);
    cols.forEach((c, i) => {
      const fid = newFid(taken);
      taken.add(fid);
      frames.push({ fid, stream, bbox: c.box, seq: i + 1 });
    });
  }
  // סדר: לפי ראש המסגרת, ובשוויון — מימין לשמאל
  frames.sort((a, b) => a.bbox[1] - b.bbox[1] || b.bbox[2] - a.bbox[2]);
  return frames.map((f, i) => ({ ...f, order: i + 1 }));
}

// ---------- דחיסה לפני הגשה ----------

// סוגים שבהם הפעולה האחרונה על אותו יעד קובעת לבד (החלפה מלאה של השדה)
const LAST_WINS = new Set([
  'stream', 'para', 'para_start', 'script', 'text', 'status', 'bbox',
  'page_type', 'mixed_line', 'certainty', 'line_ok', 'frames_set',
]);

function compactKey(op) {
  if (op.kind === 'frames_set' || op.kind === 'page_type') return op.kind;
  if (op.kind === 'frame_seq') return `frame_seq|${op.value?.fid}`;
  if (op.kind === 'styles') return null; // הפעלה/כיבוי על טווחים — הסדר חשוב
  if (!LAST_WINS.has(op.kind)) return null;
  return `${op.kind}|${(op.ids || []).join(',')}`;
}

// מסיר פעולות שנדרסו ע"י פעולה מאוחרת על אותו יעד, ותיקונים שחזרו למקור.
// מצב-הסיום זהה, ורשומת-האמת אצלם נקייה מ"הלוך-ושוב".
export function compactOps(baseDoc, ops) {
  const lastIdx = new Map();
  ops.forEach((op, i) => {
    const k = compactKey(op);
    if (k) lastIdx.set(k, i);
  });
  const lines = lineMap(baseDoc);
  return ops.filter((op, i) => {
    const k = compactKey(op);
    if (k && lastIdx.get(k) !== i) return false;
    const l = lines.get((op.ids || [])[0]);
    if (op.kind === 'text' && l && op.value === (l.text ?? l.text_ocr ?? '')) return false;
    if (op.kind === 'status' && op.value === 'restore' && l && l.status !== 'removed') return false;
    return true;
  });
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
      return `${where}זרם ← ${v}`;
    case 'para':
      return `${where}סגנון-פסקה ← ${PARA_STYLES[v]?.he || v}`;
    case 'para_start':
      return `${where}${v ? 'תחילת פסקה' : 'לא תחילת פסקה'}`;
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
      return `מסגרות: ${v.frames.length}`;
    case 'frame_seq':
      return `מסגרת ${v.fid}: מספר ${v.seq} בזרם`;
    case 'link_add':
      return `${where}קישור ידני`;
    case 'link_ok':
    case 'link_del': {
      const l = lines.get(v.src_line);
      return `${kindHe} (שורה ${l ? (l.line_no ?? 0) + 1 : '?'})`;
    }
    case 'mixed_line':
      return `${where}${v ? 'שורה מעורבת-כתבים' : 'לא מעורבת'}`;
    case 'certainty':
      return `${where}${CERTAINTY[v.v]}${v.why ? ` — ${cut(v.why, 60)}` : ''}`;
    case 'line_split':
      return `${where}פיצול בנקודה x=${v.x}`;
    case 'line_add':
      return `שורה חדשה${v.text ? ` «${cut(v.text)}»` : ''}`;
    default:
      return `${where}${kindHe}`;
  }
}
