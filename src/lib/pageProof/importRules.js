// הכללים הטהורים של צד-השרת בהגהת-העמודים: מה קורה לכל עמוד בייבוא (נוצר /
// מתעדכן / מוחלף בגרסה חדשה / מדולג), חלוקה-מחדש לרצפים אחרי ייבוא, גרסאות
// העמוד, ומצב העמוד אחרי אישור/דחייה של הגשה — לולאת הזיהוי-מחדש (§6 במפרט):
//
//   מעבר ראשון: מתנדב מתקן טקסט וגם חיתוך-שורות (פיצול/איחוד/הוספה/תיבה)
//   ← מנהל מאשר ← העמוד במצב 'recut' (לא מוצע למתנדבים) ← תוכנת-הספר חותכת
//   ומזהה מחדש ומייצאת את העמוד עם revision+1 ← הייבוא מחליף את העמוד ופותח
//   אותו למעבר שני.
//
// בלי מסד ובלי I/O — הקוראים (importPackages, ראוטי ה-API) עושים את הכתיבה.
// מסנני-Mongo שכאן הם אובייקטים פשוטים (המראה של אותם כללים בצד המסד).

import { resequence, requiredFor, DEFAULT_DOUBLE_PCT } from './sequences.js';

export const PAGE_STATUSES = ['open', 'done', 'recut', 'recut_ask'];

const validRev = (v) => (Number.isInteger(v) && v >= 1 ? v : null);

// ---------- גרסאות ----------

// גרסת עמוד שמגיע בחבילה (חוזה-העמוד: revision ברמת-העמוד; חסר = 1)
export function incomingRevision(doc) {
  return validRev(doc?.revision) ?? 1;
}

// גרסת העמוד השמור. רק השדה העליון (הייבוא כותב אותו תמיד); עמוד שנשמר לפני
// שהיה שדה כזה — 1, כמו ברירת-המחדל של הסכמה
export function storedRevision(page) {
  return validRev(page?.revision) ?? 1;
}

// הגרסה שעליה נעשתה ההגשה (הגשה ישנה בלי השדה — 1)
export function submissionRevision(sub) {
  return validRev(sub?.revision) ?? 1;
}

export function sameRevision(a, b) {
  return (validRev(a) ?? 1) === (validRev(b) ?? 1);
}

// מסנן-Mongo "העמוד/ההגשה בגרסה rev". גרסה 1 תופסת גם מסמך בלי השדה.
// בלי $or — כדי שאפשר יהיה לפזר אותו לתוך מסנן שכבר יש בו $or.
export function revisionFilter(rev) {
  const r = validRev(rev) ?? 1;
  return r === 1 ? { revision: { $in: [1, null] } } : { revision: r };
}

// ---------- "נענה" ו"התחיל" ----------

// יש לעמוד הגשה פעילה (ממתינה או מאושרת) — תוכנו לא נדרס בייבוא-חוזר:
// הפעולות שהוגשו מתייחסות למזהי-השורות שלו
export const isAnswered = (p) => (p?.activeCount || 0) > 0 || (p?.approvedCount || 0) > 0;

// העמוד כבר חולק או הוגש — הרצף שלו לא משתנה בחלוקה-מחדש (מתנדב מחזיק אותו
// או כבר עבד עליו)
export function startedPage(p, now = new Date()) {
  if (isAnswered(p)) return true;
  const until = p?.leasedUntil ? new Date(p.leasedUntil).getTime() : NaN;
  return Number.isFinite(until) && until > now.getTime();
}

// מסנני-Mongo תואמים (לעדכון מותנה — אם בינתיים מישהו הגיש/החכיר, העדכון לא חל)
export const UNANSWERED_FILTER = Object.freeze({
  activeCount: { $not: { $gt: 0 } },
  approvedCount: { $not: { $gt: 0 } },
});

export function notStartedFilter(now = new Date()) {
  return { ...UNANSWERED_FILTER, $or: [{ leasedUntil: null }, { leasedUntil: { $lte: now } }] };
}

// ---------- ייבוא ----------

// עמוד שממתין לזיהוי-מחדש מוחלף רק בגרסה חדשה יותר ממה שנשמר — גם כשיש לו
// הגשות מאושרות (הן כבר מולאו בתוכנת-הספר, ומהן נולדה הגרסה החדשה). גם עמוד שממתין לאישור מנהל
// לזיהוי-מחדש (recut_ask): גרסה חדשה (המנהל חתך אותו בתוכנה בעצמו) מחליפה אותו, והבקשה נעלמת (RECUT_RESET)
export function canReplacePage(prev, doc) {
  return !!prev && (prev.status === 'recut' || prev.status === 'recut_ask') && incomingRevision(doc) > storedRevision(prev);
}

// מה עושים בעמוד שמגיע בחבילה, מול העמוד השמור (prev; undefined = אין):
//   create          — עמוד חדש
//   update          — קיים ואיש לא הגיש אותו: התוכן מתעדכן (כמו תמיד)
//   recut           — חזר מזיהוי-מחדש בגרסה חדשה: מחליף ונפתח למעבר שני
//   skip-unexported — ממתין לזיהוי-מחדש ובחבילה גרסה חדשה, אבל תיקון-חיתוך
//                     מאושר שלו עוד לא הורד בקובץ-התיקונים (prev.unexportedRecut —
//                     הקורא בודק במסד). הגרסה החדשה נוצרה בלי התיקון הזה (למשל
//                     חיתוך-מחדש מקומי) — החלפה הייתה מאבדת אותו, ואחר כך מחילה
//                     אותו על החיתוך החדש (שורה שנוספת פעמיים)
//   skip-older      — בחבילה גרסה ישנה מזו שבאתר (למשל חבילה ישנה שהועלתה שוב)
//   skip-recut      — ממתין לזיהוי-מחדש, ובחבילה אין גרסה חדשה יותר
//   skip-answered   — כבר הוגש
export function importAction(prev, doc) {
  if (!prev) return 'create';
  if (canReplacePage(prev, doc)) return prev.unexportedRecut ? 'skip-unexported' : 'recut';
  if (incomingRevision(doc) < storedRevision(prev)) return 'skip-older';
  if (prev.status === 'recut' || prev.status === 'recut_ask') return 'skip-recut';
  if (isAnswered(prev)) return 'skip-answered';
  return 'update';
}

// השדות שמתאפסים כשעמוד מוחלף בגרסה חדשה (מעבר שני): מצב, מונים, מגישים
// והחכרה. מעבר שני הוא בדיקה של השורות שזוהו מחדש — הגשה אחת מספיקה.
export const RECUT_RESET = Object.freeze({
  status: 'open',
  activeCount: 0,
  approvedCount: 0,
  submitters: [],
  required: 1,
  leasedBy: null,
  leasedUntil: null,
  recutAsk: null,
});

// ---------- רצפים ----------

// כמה הגשות נדרשות לעמוד: לפי הרצף (כפול = 2), חוץ מעמוד במעבר שני (גרסה >1)
export function requiredForPage({ gid, seq, revision }, pct = DEFAULT_DOUBLE_PCT) {
  if ((validRev(revision) ?? 1) > 1) return 1;
  return requiredFor(gid, seq, pct);
}

// חלוקה-מחדש של כל עמודי הספר לרצפים (sequences.resequence) ← רשימת
// העדכונים לעמודים שלא התחילו: [{_id, page, seq, required}] — רק מה שהשתנה.
// pages: [{_id, page, seq, required, revision, activeCount, approvedCount, leasedUntil}]
// expectPages: מספרי-עמודים שעוד לא במסד אבל יגיעו (למשל עמודים שיועלו
// ב-ZIP אחרי ייבוא-הקישור) — משתתפים בדירוג ולא נכתבים, כך שהרצפים מחושבים
// על הספר כולו כבר עכשיו.
export function planSequences(pages, { gid, doublePct = DEFAULT_DOUBLE_PCT, now = new Date(), expectPages = [] } = {}) {
  const real = (pages || []).filter((p) => p && Number.isFinite(p.page));
  const have = new Set(real.map((p) => p.page));
  const phantoms = [];
  for (const n of expectPages || []) {
    if (!Number.isFinite(n) || have.has(n)) continue;
    have.add(n);
    phantoms.push({ _id: `expected:${n}`, page: n, seq: null, started: false });
  }
  const seqOf = resequence([
    ...real.map((p) => ({ _id: p._id, page: p.page, seq: p.seq, started: startedPage(p, now) })),
    ...phantoms,
  ]);
  const out = [];
  for (const p of real) {
    if (!seqOf.has(p._id)) continue;
    const seq = seqOf.get(p._id);
    const required = requiredForPage({ gid, seq, revision: p.revision }, doublePct);
    if (seq !== p.seq || required !== p.required) out.push({ _id: p._id, page: p.page, seq, required });
  }
  return out;
}

// ---------- מצב העמוד אחרי אישור/דחייה ----------

// אישור הגשה. recut = ההגשה הראשית של העמוד (fixesExport.pickPrimary — אותו
// כלל של קובץ-התיקונים) משנה את החיתוך ← 'recut' (לא מוצע יותר למתנדבים עד
// הגרסה החדשה). עמוד כפול שעוד חסרה לו הגשה (activeCount < required) נשאר
// פתוח: מתנדב שני אולי עובד עליו עכשיו, וזיהוי-מחדש היה מוציא אותו באמצע
// ומוחק לו את הטיוטה. הוא עובר ל-'recut' כשההגשה האחרונה נכנסת
// (statusWhenFull). אחרת המצב לא משתנה.
export function statusAfterApprove(status, recut, { activeCount = 1, required = 1 } = {}) {
  if (!recut) return status;
  if (status === 'open' && (activeCount || 0) < (required || 1)) return status;
  return 'recut';
}

// העמוד התמלא (ההגשה האחרונה הנדרשת נכנסה): ממתין לזיהוי-מחדש אם ההגשה
// הראשית שאושרה לו כבר משנה חיתוך; אחרת 'done'
export function statusWhenFull(primaryRecut) {
  return primaryRecut ? 'recut' : 'done';
}

// דחייה מפנה מקום ← 'open'. אבל עמוד שממתין לזיהוי-מחדש נשאר 'recut' כל עוד
// יש לו (בגרסה הנוכחית) הגשה מאושרת אחרת שמשנה את החיתוך
export function statusAfterReject(status, stillRecut) {
  return status === 'recut' && stillRecut ? 'recut' : 'open';
}

// מנהל משחרר עמוד מהמתנה לזיהוי-מחדש (התוכנה לא תחזיר גרסה חדשה — למשל
// תיקון-החיתוך נכשל שם): העמוד נסגר כאילו ההגשות אושרו בלי חיתוך — הושלם, או
// פתוח לבודק נוסף בעמוד כפול שחסרה לו הגשה
export function statusAfterReleaseRecut({ activeCount = 0, required = 1 } = {}) {
  return (activeCount || 0) >= (required || 1) ? 'done' : 'open';
}

// ---------- סיכום הייבוא (למסך הניהול) ----------

// שורת-הסיכום לספר אחד בתוצאת הייבוא — חלקים בעברית, לפי הסדר
export function importSummaryParts(r) {
  const n = (k) => (Number.isFinite(r?.[k]) ? r[k] : 0);
  const parts = [`${n('created')} עמודים חדשים`, `${n('updated')} עודכנו`];
  if (n('recut')) {
    const back = n('recutReturned');
    parts.push(`${n('recut')} חזרו מזיהוי-מחדש ונפתחו למעבר שני${back ? ` (${back === 1 ? 'אחד מהם חזר' : `${back} מהם חזרו`} למתנדב שביקש את הזיהוי-מחדש)` : ''}`);
  }
  if (n('linked')) parts.push(`${n('linked')} מקושרים לתמונות הספר באתר`);
  if (n('skippedAnswered')) parts.push(`${n('skippedAnswered')} דולגו (כבר הוגשו)`);
  if (n('skippedRecut')) parts.push(`${n('skippedRecut')} ממתינים לזיהוי-מחדש — בחבילה אין גרסה חדשה שלהם`);
  if (n('skippedUnexported')) {
    parts.push(
      `${n('skippedUnexported')} לא הוחלפו — לתיקון-חיתוך מאושר שלהם אין סימון "יצא בקובץ": הורידו "תיקונים חדשים" (אם כבר החלתם אותם בתוכנה — אל תחילו שוב) ויבאו שוב`
    );
  }
  if (n('skippedOlder')) parts.push(`${n('skippedOlder')} דולגו — בחבילה גרסה ישנה מזו שבאתר`);
  return parts;
}

// ---------- ייבוא קובץ-קובץ, ושער שהפסיק לחכות ----------
//
// כל קובץ נשלח בבקשה משלו. בקובץ גדול השער של האתר (reverse proxy) מפסיק לחכות לתשובה ומחזיר
// 502/503/504 — אבל השרת ממשיך לייבא. אז בודקים ברשימת-הספרים של מסך-הניהול
// (GET /api/admin/page-proof) אם הייבוא הסתיים: לפני כל קובץ מצלמים {gid: lastImportAt},
// ואחרי ה-504 בודקים כל GATEWAY_POLL_MS, עד GATEWAY_WAIT_MS.

export const GATEWAY_POLL_MS = 10 * 1000;
export const GATEWAY_WAIT_MS = 10 * 60 * 1000;

// השער הפסיק לחכות לתשובה (השרת עצמו כנראה עדיין עובד)
export const isGatewayTimeout = (status) => [502, 503, 504].includes(Number(status));

// {gid: lastImportAt} מרשימת-הספרים — התצלום שלפני שליחת הקובץ
export function importSnapshot(books) {
  const out = {};
  for (const b of books || []) if (b?.gid) out[b.gid] = b.lastImportAt ?? null;
  return out;
}

const importTime = (v) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};

// הספר שהייבוא שלו הסתיים מאז התצלום (beforeMap), או null: תאריך-הייבוא שלו חדש מזה שבתצלום, או
// שזה ספר חדש (gid שלא היה בתצלום) — וכבר יש לו תאריך-ייבוא: ספר חדש נוצר בתחילת הייבוא, והתאריך
// נכתב רק בסופו. כמה כאלה — האחרון שהסתיים. בלי תצלום — אי-אפשר לדעת (null).
export function finishedImport(beforeMap, books) {
  if (!beforeMap) return null;
  let best = null;
  for (const b of books || []) {
    const t = importTime(b?.lastImportAt);
    if (t == null || !b.gid) continue;
    const prev = Object.hasOwn(beforeMap, b.gid) ? importTime(beforeMap[b.gid]) : null;
    if (prev != null && t <= prev) continue;
    if (!best || t > importTime(best.lastImportAt)) best = b;
  }
  return best;
}

// "הייבוא הסתיים: <שם> · N עמודים · M שורות" — לספר שהייבוא שלו הסתיים אחרי שהשער הפסיק לחכות
export function importFinishedLine(book) {
  const n = (k) => (Number.isFinite(book?.[k]) ? book[k] : 0);
  return `הייבוא הסתיים: ${book?.title || book?.gid || ''} · ${n('pageCount')} עמודים · ${n('lineCount')} שורות`;
}

// השגיאות של קובץ אחד מתשובת-הייבוא: errors של השרת (כבר עם שם הקובץ), error יחיד (400/500 —
// מקבל את שם הקובץ), ותשובה שאינה JSON — "שגיאת שרת (סטטוס)"
export function importFileErrors(fileName, data, status) {
  if (!data || typeof data !== 'object') return [`${fileName}: שגיאת שרת (${status})`];
  const out = Array.isArray(data.errors) ? data.errors.map(String) : [];
  if (data.error) out.push(`${fileName}: ${data.error}`);
  return out;
}

const SUMMED = ['created', 'updated', 'recut', 'recutReturned', 'linked', 'skippedAnswered', 'skippedRecut', 'skippedUnexported', 'skippedOlder', 'resequenced'];

// התוצאות של כמה קבצים (ספר גדול בכמה ZIP-ים — אותו gid) ← שורה אחת לכל ספר, בסדר שבו הופיע:
// המונים מסתכמים, השגיאות מצטרפות
export function mergeImportResults(results) {
  const by = new Map();
  for (const r of results || []) {
    if (!r?.gid) continue;
    const cur = by.get(r.gid);
    if (!cur) {
      by.set(r.gid, { ...r, errors: [...(r.errors || [])] });
      continue;
    }
    for (const k of SUMMED) if (Number.isFinite(r[k])) cur[k] = (Number.isFinite(cur[k]) ? cur[k] : 0) + r[k];
    cur.errors.push(...(r.errors || []));
    if (r.title) cur.title = r.title;
  }
  return [...by.values()];
}
