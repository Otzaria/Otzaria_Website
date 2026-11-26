// "אישור בלי אינטרנט" בהגהה לאימון (docs/115 בפרויקט ה-OCR) — החלק הטהור:
// צורת הפריט בקובץ שיורד, חלוקת ההורדה לחלקים, ובדיקת קובץ-ההחלטות (tpd/1) שחוזר.
// טהור לגמרי (בלי מסד, בלי next) — רץ בשרת, בבדיקות, ובשום מקום אחר.
//
// הכלל המרכזי: לכל פריט יורד "חותם-גרסה" v = זמן ההגשה (submittedAt). החלטה מוחלת באתר רק
// כשהפריט עדיין ממתין ו-v שלו זהה — כך החלטה ישנה לעולם אינה נוגעת בהגשה חדשה.

import { SECTIONS, SECTION_LABELS, SCRIPT_LABELS, OCR_ACTION_LABELS, FRAME_ROLE_LABELS } from '../vocab.js';

export const OFFLINE_KIND = 'tpo/1'; // הנתונים שבתוך קובץ ה-HTML
export const DECISIONS_CONTRACT = 'tpd/1'; // קובץ-ההחלטות שחוזר לאתר
export const DECISIONS = ['approve', 'reject', 'fix'];
export const MAX_DECISIONS = 10000;
// כמה שורות בקובץ אחד (זיהוי/נתב). בגלאי — ספר אחד לקובץ
export const LINES_PER_FILE = 1000;
export const LINES_PER_FILE_MIN = 10;
export const LINES_PER_FILE_MAX = 3000;

export const OFFLINE_ID_RE = /^tpo-\d{8}-[0-9a-f]{6}$/;
const OID_RE = /^[0-9a-f]{24}$/i;

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
export function newOfflineId(now = new Date(), rand = null) {
  const r = rand || Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return `tpo-${ymd(now)}-${r}`;
}

const iso = (d) => (d ? new Date(d).toISOString() : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v) => (Number.isInteger(v) ? v : null);

// חלוקת הזיהוי/הנתב לקבצים: ids ממוינים עולה. כל חלק = {after, count} — "אחרי המזהה הזה,
// עד count פריטים". גבול לפי מזהה (לא לפי מקום ברשימה), כדי שאישור באתר בין ההורדות
// לא יזיז פריטים מחלק לחלק
export function lineParts(sortedIds, per = LINES_PER_FILE) {
  const out = [];
  for (let i = 0; i < sortedIds.length; i += per) {
    out.push({ after: i === 0 ? null : String(sortedIds[i - 1]), count: Math.min(per, sortedIds.length - i) });
  }
  return out;
}

export function clampPer(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return LINES_PER_FILE;
  return Math.max(LINES_PER_FILE_MIN, Math.min(LINES_PER_FILE_MAX, n));
}

// מפתחות התמונות בתוך הקובץ: תמונת הפריט — i<id>; תמונת-הקשר — c<מספר> (משותפת לשורות העמוד)
export const itemImageKey = (id) => `i${id}`;

// פריט כפי שהוא נכנס לקובץ. doc = TrainingProofItem (lean), volName(userId) → שם להצגה,
// ctxKey(ctxPath) → מפתח תמונת-הקשר או null (כשהיא לא נכנסת). בלי מפתח-ספר ובלי אימייל
export function offlineItem(doc, { volName = () => null, ctxKey = () => null } = {}) {
  const p = doc.payload || {};
  const id = String(doc._id);
  const base = {
    id,
    v: iso(doc.submittedAt),
    img: itemImageKey(id),
    w: num(p.w),
    h: num(p.h),
    alias: p.alias || '',
    page: int(p.page),
    result: doc.result || null,
    vol: doc.vol ? { id: String(doc.vol), name: volName(String(doc.vol)) } : null,
    rejected: Array.isArray(doc.rejectedFor) ? doc.rejectedFor.length : 0,
  };
  const ctx = () => {
    const k = doc.ctxPath && Array.isArray(p.ctx?.bbox) ? ctxKey(doc.ctxPath) : null;
    return k ? { img: k, bbox: p.ctx.bbox } : null;
  };
  if (doc.section === 'ocr') {
    return {
      ...base,
      track: p.track || null,
      source: p.source || null,
      text: p.text || '',
      conf: num(p.conf),
      line: int(p.line_no),
      ctx: ctx(),
    };
  }
  if (doc.section === 'router') {
    return {
      ...base,
      pred: p.pred || null,
      predP: num(p.pred_p),
      text: p.text || '',
      words: Array.isArray(p.words)
        ? p.words.map((w) => ({ k: w.k, box: w.box, pred: w.pred || null, text: w.text || '' })).sort((a, b) => a.k - b.k)
        : null,
      ctx: ctx(),
    };
  }
  return {
    ...base,
    ptype: p.ptype || 'scan',
    scale: num(p.scale) ?? 1,
    frames: Array.isArray(p.frames) ? p.frames : [],
  };
}

// שמות-תצוגה למתנדבים: השם בלבד (לעולם לא אימייל). בלי שם — "מתנדב 1", "מתנדב 2"… לפי סדר
// ההופעה, כדי שאפשר יהיה בכל זאת לסנן לפי מתנדב
export function volunteerNames(users, ids) {
  const byId = new Map(users.map((u) => [String(u._id), String(u.name || '').trim()]));
  const out = new Map();
  let n = 0;
  for (const id of ids.map(String)) {
    if (out.has(id)) continue;
    out.set(id, byId.get(id) || `מתנדב ${++n}`);
  }
  return out;
}

// התוויות שהחלון צריך (החלון עצמו אינו מייבא כלום — הכול בתוך הקובץ)
export const VIEWER_LABELS = {
  sections: SECTION_LABELS,
  scripts: SCRIPT_LABELS,
  actions: OCR_ACTION_LABELS,
  roles: FRAME_ROLE_LABELS,
};
// צבעי הכתב (כמו common/scripts.js) והתפקיד (כמו frames/look.js) — ערכים קבועים, כי בקובץ אין את
// משתני-העיצוב של האתר
export const VIEWER_COLORS = {
  scripts: { square: '#1d4ed8', rashi: '#b45309', latin: '#7c3aed', mixed: '#be123c', neutral: '#6b7280' },
  roles: {
    body: '#2a5bd7',
    commentary: '#c2410c',
    notes: '#15803d',
    margin: '#7c3aed',
    heading: '#be123c',
    caption: '#0e7490',
    box: '#8a5a2b',
    furniture: '#6b7280',
    object: '#111827',
  },
};

// שם הקובץ שיורד (ASCII בלבד)
export function offlineFileName({ section, offlineId, part, parts }) {
  const p = parts > 1 ? `-p${part}of${parts}` : '';
  return `tp-offline-${section}-${offlineId}${p}.html`;
}

// ---------- קובץ-ההחלטות ----------

const isIso = (s) => typeof s === 'string' && s.length <= 40 && !Number.isNaN(Date.parse(s));

// בדיקת קובץ-ההחלטות לפני כל נגיעה במסד. מחזיר {section, offlineId, decisions:[{id,v,d,mark?}]}
// או {error} בעברית. החלטה כפולה לאותו פריט — האחרונה קובעת
export function checkDecisionsFile(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'הקובץ אינו קובץ-החלטות' };
  if (body.contract !== DECISIONS_CONTRACT) return { error: 'זה לא קובץ-החלטות של "אישור בלי אינטרנט" (tpd/1)' };
  if (!SECTIONS.includes(body.section)) return { error: 'חלק לא מוכר בקובץ' };
  if (!Array.isArray(body.decisions)) return { error: 'אין בקובץ רשימת החלטות' };
  if (!body.decisions.length) return { error: 'אין בקובץ אף החלטה' };
  if (body.decisions.length > MAX_DECISIONS) return { error: `יותר מ-${MAX_DECISIONS.toLocaleString('he-IL')} החלטות בקובץ אחד` };
  const section = body.section;
  const byId = new Map();
  for (const [i, x] of body.decisions.entries()) {
    const at = `בהחלטה ${i + 1}`;
    if (!x || typeof x !== 'object') return { error: `${at}: החלטה לא תקינה` };
    if (!OID_RE.test(String(x.id || ''))) return { error: `${at}: מזהה-פריט לא תקין` };
    if (!isIso(x.v)) return { error: `${at}: חסר חותם-הגרסה` };
    if (!DECISIONS.includes(x.d)) return { error: `${at}: החלטה לא מוכרת` };
    const one = { id: String(x.id).toLowerCase(), v: new Date(x.v).toISOString(), d: x.d };
    if (x.d === 'fix') {
      if (section === 'frames') return { error: `${at}: תיקון מסגרות נעשה רק באתר` };
      if (!x.mark || typeof x.mark !== 'object' || Array.isArray(x.mark)) return { error: `${at}: חסר התיקון` };
      one.mark = x.mark;
    }
    byId.set(one.id, one);
  }
  const offlineId = OFFLINE_ID_RE.test(String(body.offline_id || '')) ? body.offline_id : null;
  return { section, offlineId, decisions: [...byId.values()] };
}

// הסיבות לדילוג — לדוח שבסוף ההעלאה
export const SKIP_REASONS = {
  gone: 'הפריט כבר לא באתר (ירד לתחנה או נמחק)',
  'wrong-section': 'הפריט שייך לחלק אחר',
  'approved-online': 'כבר אושר באתר',
  'not-pending': 'כבר לא ממתין (נדחה באתר או חזר למאגר)',
  resubmitted: 'הוגש מחדש מאז ההורדה — ההחלטה ישנה',
  'stream-change': 'באמצע שינוי-זרם — לנסות שוב מאוחר יותר',
  changed: 'השתנה באתר בדיוק בזמן ההעלאה',
  'bad-mark': 'התיקון לא תקין',
};

// סיווג החלטה מול המצב הנוכחי של הפריט (doc = lean, או null). מחזיר null = אפשר להחיל, או סיבת-דילוג
export function skipReason(decision, doc, section) {
  if (!doc) return 'gone';
  if (doc.section !== section) return 'wrong-section';
  if (doc.status === 'approved') return 'approved-online';
  if (doc.status !== 'submitted') return 'not-pending';
  if (iso(doc.submittedAt) !== decision.v) return 'resubmitted';
  if (doc.streamChange) return 'stream-change';
  return null;
}
