// הכללים של חלק הגלאי — טהור: בדיקת עמוד לפני שמירה, מצב עמוד, מצב ספר ותפיסת ספר.
// משותף לשרת (src/app/api/training-proof/frames/) ולעורך בדפדפן, כדי ששניהם יסכימו.
//
// עמוד = TrainingProofItem בחלק frames (docs/76 §4.3). מחזור-החיים שלו כאן:
//   available — הצעת המודל כמו שהגיעה (payload.frames), איש לא נגע
//   held      — טיוטה: המתנדב שינה משהו (כל שינוי נשמר מיד), ועוד לא אישר. result = {status:'draft', frames, …};
//               heldBy = מי ששינה אחרון. טיוטה נשארת בעמוד גם כשהספר משתחרר — מי שממשיך רואה אותה
//   submitted — "העמוד נכון" (Enter) או "דלג". result = {status:'marked'|'skip', frames, streams_added} — בדיוק
//               מה שיוצא בקובץ-ההחזרה (§5.3); vol = מי שאישר. שינוי נוסף מחזיר את העמוד לטיוטה
//   approved  — המנהל אישר: קריאה בלבד
// ספר = TrainingProofBook: נלקח בשלמותו ל-48 שעות (BOOK_CLAIM_MS); רק מי שלקח אותו עורך את עמודיו.

import { FRAME_ROLES, OBJECT_KINDS, validBox } from '../../../lib/trainingProof/vocab.js';
import { roundBox, renumber, NO_STREAM_ROLES } from './geometry.js';
import { STREAM_KINDS, frameRoleFor, syncRoles, changedStreams } from './streamRoles.js';

export const MAX_FRAMES = 300;
export const PAGE_STATUSES = ['draft', 'marked', 'skip'];
// כמה ספרים מתנדב מחזיק בבת אחת (ברירת-מחדל של הסשן — אפשר לשנות)
export const MAX_BOOKS_PER_VOLUNTEER = 1;
const FID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const STREAM_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_STREAM_NAME = 60;

const fail = (error) => ({ error });

// זרמים שהמתנדבים הוסיפו לספר (added: true), כפי שהם יוצאים ב-streams_added
export const addedStreams = (streams) =>
  (streams || []).filter((s) => s.added).map((s) => ({ id: s.id, name: s.name, role: s.role }));

// מה שיוצא עם עמוד על הזרמים שלו (§5.3): streams_added — זרמים שנוספו ומשמשים בעמוד; streams_changed (רשות) — זרמים
// מהתחנה שהסוג שלהם שונה ומשמשים בעמוד. כך כל עמוד שחוזר לתחנה נושא את מה שהוא צריך
function streamLists(streams, frames) {
  const used = new Set(frames.map((g) => g.stream).filter(Boolean));
  const out = { streams_added: addedStreams(streams).filter((s) => used.has(s.id)) };
  const changed = changedStreams(streams).filter((s) => used.has(s.id));
  if (changed.length) out.streams_changed = changed;
  return out;
}

// body = {status: 'draft'|'marked'|'skip', frames}. streams = רשימת-הזרמים של הספר (כולל מה שנוסף).
// מחזיר {result} — מה שנשמר ב-TrainingProofItem.result — או {error} בעברית.
// ב-marked/skip הצורה היא של §5.3 (בלי src); בטיוטה נשמר גם src, כדי שהצעה שלא נגעו בה תישאר מקווקוות.
// התפקיד של מסגרת-טקסט בזרם נקבע לפי סוג הזרם (streamRoles.js) — גם אם הדפדפן שלח אחר
export function checkFramesPage(payload, body, { streams = [] } = {}) {
  const status = body?.status;
  if (!PAGE_STATUSES.includes(status)) return fail('מצב-עמוד לא מוכר');
  const list = body.frames;
  if (!Array.isArray(list)) return fail('חסרה רשימת המסגרות');
  if (list.length > MAX_FRAMES) return fail('יותר מדי מסגרות בעמוד');
  const w = payload?.w ?? null;
  const h = payload?.h ?? null;
  const byId = new Map((streams || []).map((s) => [s.id, s]));
  const fids = new Set();
  const ords = new Set();
  const out = [];
  for (const [i, f] of list.entries()) {
    const n = i + 1;
    if (!f || typeof f !== 'object') return fail(`מסגרת ${n} לא תקינה`);
    if (!FID_RE.test(String(f.fid || ''))) return fail(`למסגרת ${n} אין מזהה תקין`);
    if (fids.has(f.fid)) return fail(`מזהה-מסגרת כפול: ${f.fid}`);
    fids.add(f.fid);
    if (!FRAME_ROLES.includes(f.role)) return fail(`תפקיד לא מוכר במסגרת ${n}`);
    const isObj = f.role === 'object';
    if ((f.kind === 'object') !== isObj) return fail(`במסגרת ${n} הסוג לא מתאים לתפקיד`);
    const box = Array.isArray(f.box) ? roundBox(f.box.map(Number)) : null;
    if (!validBox(box, w, h)) return fail(`התיבה של מסגרת ${n} לא תקינה`);
    let stream = f.stream ?? null;
    if (NO_STREAM_ROLES.includes(f.role)) stream = null;
    if (stream !== null && !byId.has(stream)) return fail(`זרם לא מוכר במסגרת ${n}`);
    let ord = f.ord ?? null;
    if (ord !== null) {
      if (!Number.isInteger(ord) || ord < 1) return fail(`מספר-סדר לא תקין במסגרת ${n}`);
      if (ords.has(ord)) return fail(`שתי מסגרות באותו מקום בסדר הקריאה (${ord})`);
      ords.add(ord);
    }
    const g = { fid: f.fid, kind: isObj ? 'object' : 'text', role: f.role, box, stream, ord, cont: NO_STREAM_ROLES.includes(f.role) ? false : !!f.cont };
    g.role = frameRoleFor(g, byId);
    if (isObj) {
      if (!OBJECT_KINDS.includes(f.obj)) return fail(`סוג-אובייקט לא מוכר במסגרת ${n}`);
      g.obj = f.obj;
      if (typeof f.caption_of === 'string') g.caption_of = f.caption_of;
    }
    if (status === 'draft') g.src = f.src === 'auto' ? 'auto' : 'human';
    out.push(g);
  }
  for (const g of out) if (g.caption_of && !fids.has(g.caption_of)) delete g.caption_of;
  if (status === 'marked') {
    const missing = out.filter((g) => g.kind === 'text' && g.ord === null).length;
    if (missing) return fail(`יש ${missing === 1 ? 'מסגרת אחת' : `${missing} מסגרות`} בלי מספר בסדר הקריאה — לחצו O וסדרו`);
  }
  const frames = renumber(out);
  return { result: { status, frames, ...streamLists(streams, frames) } };
}

// זרם חדש שמתנדב מוסיף לספר: {name, role}. מחזיר {stream} או {error}
export function checkNewStream(streams, body) {
  const name = String(body?.name ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return fail('צריך שם לזרם');
  if (name.length > MAX_STREAM_NAME) return fail('השם ארוך מדי');
  const role = body?.role;
  if (!STREAM_KINDS.includes(role)) return fail('סוג לא מתאים לזרם');
  if ((streams || []).some((s) => s.name === name)) return fail('כבר יש זרם בשם הזה');
  let k = 0;
  for (const s of streams || []) {
    const m = /^x(\d+)$/.exec(s.id);
    if (m) k = Math.max(k, +m[1]);
  }
  const id = `x${k + 1}`;
  if (!STREAM_ID_RE.test(id)) return fail('מזהה לא תקין');
  return { stream: { id, name, role, added: true } };
}

// התוצאה של עמוד אחרי שינוי ברשימת-הזרמים (סוג של זרם השתנה): התפקידים לפי הזרמים, ו-streams_added עם
// הסוג החדש. מחזיר את אותו אובייקט כשאין מה לשנות
export function resyncResult(result, streams) {
  if (!result || !Array.isArray(result.frames)) return result;
  const frames = syncRoles(result.frames, streams);
  const lists = streamLists(streams, frames);
  const was = { streams_added: result.streams_added || [], ...(result.streams_changed?.length ? { streams_changed: result.streams_changed } : {}) };
  if (frames === result.frames && JSON.stringify(lists) === JSON.stringify(was)) return result;
  const { streams_changed: _old, ...rest } = result;
  return { ...rest, frames, ...lists };
}

// מצב עמוד לתצוגה: proposed · draft · marked · skip · approved
export function pageState(item) {
  if (item.status === 'approved') return 'approved';
  if (item.status === 'submitted') return item.result?.status === 'skip' ? 'skip' : 'marked';
  if (item.status === 'held' && item.result?.status === 'draft') return 'draft';
  return 'proposed';
}

// המסגרות שהעורך מציג: מה שסומן (טיוטה או סופי), ובלעדיו — הצעת המודל
export function effectiveFrames(item) {
  const st = pageState(item);
  if (st === 'proposed') return (item.payload?.frames || []).map((f) => ({ ...f, src: f.src === 'human' ? 'human' : 'auto' }));
  return (item.result?.frames || []).map((f) => ({ ...f, src: f.src || 'human' }));
}

// מי עבד על העמוד אחרון (מזהה-משתמש כמחרוזת) — לטיוטה heldBy, לסופי vol
export function pageBy(item) {
  const st = pageState(item);
  if (st === 'draft') return item.heldBy ? String(item.heldBy) : null;
  if (st === 'proposed') return null;
  return item.vol ? String(item.vol) : null;
}

const DONE_STATES = ['marked', 'skip', 'approved'];
export const isDoneState = (st) => DONE_STATES.includes(st);

// תפיסה בתוקף?
export const claimActive = (book, now = new Date()) =>
  !!book?.claimedBy && !!book.claimedUntil && new Date(book.claimedUntil).getTime() > now.getTime();

// כל עמודי הספר סומנו (ממתינים לאישור / אושרו)? counts כמו ב-bookState
export const bookDone = (c) => !!c && c.total > 0 && (c.done || 0) >= c.total;

// מצב ספר ברשימה. counts = {total, done, draft, by: {userId: עמודים}}; userId — המתנדב שמסתכל.
// מחזיר {state, claimedBy, claimedUntil, worked, workedBy}:
//   done    — כל העמודים סומנו (ממתינים לאישור / אושרו) — אין מה לקחת
//   mine    — הספר אצלך (בתוקף)
//   taken   — אצל מתנדב אחר (בתוקף)
//   partial — "הופסק באמצע": אף אחד לא מחזיק, ויש עבודה (worked עמ', רובם בידי workedBy)
//   free    — פנוי, איש לא נגע
export function bookState(book, counts, userId, now = new Date()) {
  const c = counts || { total: 0, done: 0, draft: 0, by: {} };
  const worked = (c.done || 0) + (c.draft || 0);
  const by = Object.entries(c.by || {}).sort((a, b) => b[1] - a[1]);
  const workedBy = book.lastBy ? String(book.lastBy) : by[0]?.[0] || null;
  const base = { worked, workedBy, claimedBy: null, claimedUntil: null };
  if (bookDone(c)) return { ...base, state: 'done' };
  if (claimActive(book, now)) {
    const mine = String(book.claimedBy) === String(userId);
    return { ...base, state: mine ? 'mine' : 'taken', claimedBy: String(book.claimedBy), claimedUntil: new Date(book.claimedUntil) };
  }
  return { ...base, state: worked > 0 ? 'partial' : 'free' };
}

// האם המתנדב יכול לקחת את הספר עכשיו. otherClaims — ספרים אחרים שאצלו בתוקף ({book, alias, counts}).
// ספר שסיים והגיש (כל עמודיו ממתינים לאישור) אינו "בעבודה" ואינו חוסם; עמוד שהמנהל דחה חוזר
// להיות פתוח, ואז הספר שוב בעבודה וחוסם — כל עוד הוא אצל המתנדב.
// מחזיר {ok:true} או {ok:false, status, error}. התפיסה עצמה — עדכון מותנה אטומי בשרת
export function claimDecision(book, counts, userId, now = new Date(), { otherClaims = [] } = {}) {
  if (!book) return { ok: false, status: 404, error: 'הספר לא נמצא' };
  const st = bookState(book, counts, userId, now);
  if (st.state === 'done') return { ok: false, status: 409, error: 'כל עמודי הספר כבר סומנו' };
  if (st.state === 'taken') return { ok: false, status: 409, error: 'הספר בעבודה אצל מתנדב אחר' };
  if (st.state === 'mine') return { ok: true, already: true };
  const others = otherClaims.filter((b) => b.book !== book.book && !bookDone(b.counts));
  if (others.length >= MAX_BOOKS_PER_VOLUNTEER) {
    return { ok: false, status: 409, error: `כבר יש לך ספר בעבודה (${others[0].alias || 'ספר'}). סיימו או שחררו אותו קודם` };
  }
  return { ok: true, already: false };
}
