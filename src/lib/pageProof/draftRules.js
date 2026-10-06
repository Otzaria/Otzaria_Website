// הטיוטה בשרת (docs/63 §2) — הכללים הטהורים, משותפים לשרת (serverDrafts.js, ראוט ה-draft) ולדפדפן (useServerDraft,
// דף המתנדב). בלי מסד ובלי DOM; האחסון בדפדפן מוזרק (localStorage, או אובייקט עם getItem/setItem/removeItem בבדיקות).
//
// טיוטה אחת לעמוד, בשרת: רק מי שמחזיק עכשיו בעמוד כותב אותה, ומי שתופס אותו אחריו (או אותו מתנדב ממחשב אחר) ממשיך
// ממנה. localStorage נשאר מטמון מהיר (מפתח-הטיוטה לפי העמוד והגרסה — drafts.js): בפתיחה — החדשה מבין השתיים
// (pickDraft); אחרי כל שינוי — מקומית מיד, ובשרת אחרי השהיה קצרה ולכל היותר כל ~5 שניות (useServerDraft).

import { SEG_OK } from './textModel.js';
import { sanitizeOp, validateOp } from './ops.js';
import { isStage } from './stages.js';
import { hash32 } from './sequences.js';

// שמירה בשרת: אחרי ההקלדה האחרונה (IDLE), לכל היותר אחת לכל SAVE, ושוב אחרי כשל-רשת (RETRY)
export const DRAFT_SAVE_MS = 5000;
export const DRAFT_IDLE_MS = 1500;
export const DRAFT_RETRY_MS = 15000;
// תקרות: מספר הפעולות בטיוטה (רשימת-העבודה של העורך, עם חצאי-האישור), והאטה לכל משתמש בשרת
export const MAX_DRAFT_OPS = 5000;
// keepalive (שמירת-היציאה מהדף): דפדפנים דוחים גוף מעל 64KiB — מעל זה בקשה רגילה, והעותק המקומי הוא הגיבוי
export const KEEPALIVE_MAX = 60 * 1024;
export const DRAFT_RATE = Object.freeze({ tokens: 40, interval: 'minute' });
// מה ידוע בדפדפן על הטיוטה בשרת (מתי נשמרה שם בפעם האחרונה, והשלב) — לכל עמוד, ליד הטיוטה עצמה
export const DRAFT_META_PREFIX = 'page-proof-draft-meta:';
const MAX_PA = 80;

export const DRAFT_MSG = Object.freeze({
  missing: 'העמוד לא נמצא',
  reload: 'העמוד עודכן מאז שנפתח (חזר מזיהוי-מחדש) — טענו אותו מחדש',
  notHolder: 'העמוד אינו בטיפולכם עכשיו, ולכן הטיוטה לא נשמרה באתר (היא שמורה בדפדפן)',
  stale: 'הטיוטה של העמוד נשמרה בינתיים בלשונית או במחשב אחר — טענו את העמוד מחדש כדי להמשיך מהגרסה העדכנית (השינויים מכאן שמורים בדפדפן)',
  ops: 'רשימת התיקונים חסרה',
  tooMany: (n) => `הטיוטה גדולה מדי (${n} פעולות)`,
  rate: 'יותר מדי שמירות בזמן קצר — הטיוטה תישמר שוב בעוד רגע',
});

// ---------- מה נשלח ומה נשמר ----------

// רשימת-העבודה של העורך (useProofEditor.allOps) ← מה שנשלח לשרת: הפעולה עצמה, ומשדות-הפנים רק _local (חצי-אישור
// של שורה שמתחלקת בין פסקאות), _pa (המפתח שלו) ו-_cmp ("לספר בלבד" שנוסף מעצמו לתיקון-טקסט). בלי קבוצות-Undo
// וצבירת-הקלדה (_g, _s, _c, _t, _from) — הם של הלשונית הזו בלבד.
export function draftPayload(all) {
  const out = [];
  for (const o of Array.isArray(all) ? all : []) {
    if (!o || typeof o !== 'object' || typeof o.kind !== 'string') continue;
    const op = { kind: o.kind, page: o.page };
    if (Array.isArray(o.ids)) op.ids = o.ids.slice();
    if (o.value !== undefined) op.value = o.value;
    if (o._local === true) op._local = true;
    if (typeof o._pa === 'string') op._pa = o._pa;
    if (o._cmp === true) op._cmp = true;
    if (o.revert === true) op.revert = true;
    if (o.revert === true && typeof o.revert_status === 'string') op.revert_status = o.revert_status;
    out.push(op);
  }
  return out;
}

// מה שהדפדפן שלח ← מה שנשמר: פעולת-חוזה רק בצורת-החוזה (ops.sanitizeOp) ורק אם היא תקינה מול העמוד בגרסה הזו
// (ops.validateOp — אותה בדיקה של העורך לפני כל צעד, ושל השרת בהגשה); חצי-אישור — רק seg_ok על שורה שבעמוד.
// פעולה שאינה עוברת — יורדת (dropped), לא מכשילה את השמירה. ← {ops, dropped} או {error}
export function sanitizeDraftOps(doc, raw) {
  if (!Array.isArray(raw)) return { error: DRAFT_MSG.ops };
  if (raw.length > MAX_DRAFT_OPS) return { error: DRAFT_MSG.tooMany(raw.length) };
  const lines = new Set((doc?.lines || []).map((l) => l?.id));
  const ops = [];
  let dropped = 0;
  for (const o of raw) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) {
      dropped++;
      continue;
    }
    if (o._local === true) {
      const id = Array.isArray(o.ids) && o.ids.length === 1 ? o.ids[0] : null;
      if (o.kind === SEG_OK && Number.isInteger(id) && lines.has(id) && Number.isInteger(o.value) && o.value >= 0 && o.page === doc?.page) {
        const op = { kind: SEG_OK, page: o.page, ids: [id], value: o.value, _local: true };
        if (typeof o._pa === 'string' && o._pa.length <= MAX_PA) op._pa = o._pa;
        ops.push(op);
      } else dropped++;
      continue;
    }
    const op = sanitizeOp(o);
    if (validateOp(doc, op)) {
      dropped++;
      continue;
    }
    if (o._cmp === true && op.kind === 'train_text') op._cmp = true;
    ops.push(op);
  }
  return { ops, dropped };
}

// מספר הפעולות "של ממש" בטיוטה (בלי חצאי-האישור המקומיים) — "N שינויים"
export const liveCount = (ops) => (Array.isArray(ops) ? ops.filter((o) => o && typeof o === 'object' && !o._local).length : 0);

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const iso = (d) => (d ? new Date(d).toISOString() : null);

// הטיוטה כפי שנשלחת לדפדפן (GET /api/page-proof/pages/[id]) — בלי מזהי-משתמשים: מי כתב, האם זה הצופה (mine), והמידע
// לעורך ולהודעות. inherited.ops — מה שהתקבל ממישהו אחר (מסומן בעורך). שמות מתנדבים אחרים (מי כתב לפני, על איזו הגשה
// זה מבוסס) — רק למנהל (admin); למתנדב — ריק, ושמו שלו רק כשהטיוטה שלו.
export function publicDraft(d, viewerId, { admin = false } = {}) {
  if (!d) return null;
  const inh = d.inherited && typeof d.inherited === 'object' ? d.inherited : null;
  const mine = sameId(d.by, viewerId);
  const name = (n) => (admin ? n || '' : '');
  return {
    ops: Array.isArray(d.ops) ? d.ops : [],
    count: liveCount(d.ops),
    stage: isStage(d.stage) ? d.stage : null,
    revision: Number.isInteger(d.revision) ? d.revision : 1,
    updatedAt: iso(d.updatedAt),
    byName: admin || mine ? d.byName || '' : '',
    mine,
    carried: d.carried && typeof d.carried === 'object' ? d.carried : null,
    recut: d.recut && typeof d.recut === 'object' ? { sentAt: iso(d.recut.sentAt), backAt: iso(d.recut.backAt) } : null,
    inherited: inh
      ? {
          source: inh.source || 'draft',
          byName: name(inh.byName),
          at: iso(inh.at),
          ops: Array.isArray(inh.ops) ? inh.ops : [],
          count: liveCount(inh.ops),
          basedOn: inh.basedOn && inh.basedOn.id ? { id: String(inh.basedOn.id), byName: name(inh.basedOn.byName), kind: inh.basedOn.kind || 'submission' } : null,
        }
      : null,
  };
}

// ---------- מה שהתקבל ממישהו אחר (הבודק השני, עמוד שנפתח מחדש, מתנדב קודם) ----------

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v;
}

// מפתח-השוואה של פעולה: צורת-החוזה בלבד (ops.sanitizeOp), במפתחות ממוינים — אותה פעולה בשתי רשימות = אותו מפתח
export const opKey = (op) => JSON.stringify(canon(sanitizeOp(op)));

// לכל פעולה ב-ops — המקום של פעולה זהה ב-baseOps שעוד לא הותאמה (כל פעולה שם מותאמת פעם אחת), או -1. חצאי-אישור
// מקומיים אינם מותאמים.
export function matchOps(baseOps, ops) {
  const pool = new Map();
  (Array.isArray(baseOps) ? baseOps : []).forEach((o, j) => {
    if (!o || typeof o !== 'object' || o._local) return;
    const k = opKey(o);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(j);
  });
  return (Array.isArray(ops) ? ops : []).map((o) => {
    if (!o || typeof o !== 'object' || o._local) return -1;
    const list = pool.get(opKey(o));
    return list && list.length ? list.shift() : -1;
  });
}

// הגשה שמבוססת על הגשה קודמת (הבודק השני — docs/63 §4): לכל פעולה שלה — "<מזהה-ההגשה-הקודמת>:<מקום שם>" כשהיא זהה
// לפעולה שם, אחרת null. יוצא בקובץ-התיקונים כ-same_as: תוכנת-הספר מסמנת פעולה כזו "כבר חלה" כשההגשה הקודמת כבר הוחלה
// אצלה, ואינה מחילה אותה פעמיים.
export function sameAsMap(baseId, baseOps, ops) {
  if (baseId == null) return (ops || []).map(() => null);
  return matchOps(baseOps, ops).map((j) => (j >= 0 ? `${String(baseId)}:${j}` : null));
}

// מה השתנה מעבר להגשה הקודמת: added — מקומות ב-ops שאין כמותם בקודמת; removed — פעולות של הקודמת שאינן בזו (הוחזרו
// למקור או הוחלפו)
export function basedOnDelta(baseOps, ops) {
  const m = matchOps(baseOps, ops);
  const used = new Set(m.filter((j) => j >= 0));
  return {
    added: m.map((j, i) => (j < 0 && ops[i] && !ops[i]._local ? i : -1)).filter((i) => i >= 0),
    removed: (Array.isArray(baseOps) ? baseOps : []).filter((o, j) => o && !o._local && !used.has(j)),
  };
}

// בעורך: אילו מהפעולות שבטיוטה עכשיו (ops — בלי המקומיות, כמו ProofEditor ops) הן מה שהתקבל (inheritedOps), ואילו
// שורות הן נוגעות בהן. ← {idx: Set(מקומות ב-ops), lines: Set(מזהי-שורות)}
export function splitInherited(ops, inheritedOps) {
  const idx = new Set();
  const lines = new Set();
  if (!Array.isArray(inheritedOps) || !inheritedOps.length) return { idx, lines };
  matchOps(inheritedOps, ops).forEach((j, i) => {
    if (j < 0) return;
    idx.add(i);
    for (const id of ops[i]?.ids || []) if (Number.isInteger(id) && id > 0) lines.add(id);
  });
  return { idx, lines };
}

// "N שינויים"
export const changesHe = (n) => (Number(n) === 1 ? 'שינוי אחד' : `${Number(n) || 0} שינויים`);

// הנוסח של ההודעה על טיוטה שהתקבלה ממישהו אחר (InheritedNotice) — בלי שם המתנדב הקודם: {title, body}
export function inheritedHeadline(inh) {
  const n = changesHe(inh?.count);
  if (inh?.source === 'submission') {
    return {
      title: 'בדיקה נוספת של העמוד:',
      body: `מתחילים מההגשה של מתנדב קודם (${n}). מה שהוא תיקן מסומן — אשרו או תקנו; כל שינוי אפשר להחזיר למקור (לוח הפרטים ← שינויים).`,
    };
  }
  if (inh?.source === 'approved') {
    return {
      title: 'מנהל פתח את העמוד מחדש לעריכה:',
      body: `מתחילים מהגרסה שאושרה (${n}), והשינויים שבה מסומנים. תקנו את מה שצריך והגישו שוב — האישור שוב בידי מנהל.`,
    };
  }
  return {
    title: `ממשיכים מהעבודה של מתנדב קודם (${n}).`,
    body: 'השינויים שלו מסומנים: אפשר להמשיך מהם, לשנות כל אחד או להחזיר אותו למקור (לוח הפרטים ← שינויים) — או להתחיל מאפס.',
  };
}

// ---------- בדפדפן: המטמון המקומי מול הטיוטה בשרת ----------

function writeOps(storage, key, ops) {
  try {
    if (ops.length) storage.setItem(key, JSON.stringify({ ops, at: Date.now() }));
    else storage.removeItem(key);
  } catch {
    /* אחסון חסום */
  }
}

// ההכרעה של המשתמש בסתירה (applyServerDraft ← conflict): 'mine' — העבודה מכאן; 'server' — מה שבאתר; 'merge' — האיחוד
// (של האתר, ואחריו מה שיש רק כאן — במקום סותר, מה שמכאן גובר). ← {source, stage, srv} כמו applyServerDraft
export function resolveDraftConflict(storage, { pageId, draftKey, server, conflict, choice }) {
  const ops = choice === 'server' ? conflict.server : choice === 'mine' ? conflict.local : conflict.merged;
  const stage = server?.stage ?? null;
  writeOps(storage, draftKey, Array.isArray(ops) ? ops : []);
  writeDraftMeta(storage, pageId, { key: draftKey, srv: server?.updatedAt ?? null, stage, stale: false, base: baseKeysOf(server?.ops) });
  return { source: choice === 'server' ? 'server' : 'local', stage, srv: server?.updatedAt ?? null, merged: 0 };
}

export const draftMetaKey = (pageId) => `${DRAFT_META_PREFIX}${pageId}`;

// {key (מפתח-הטיוטה שאליו מתייחס), srv (updatedAt של הטיוטה בשרת בשמירה/בטעינה האחרונה), stage} או null
export function readDraftMeta(storage, pageId) {
  try {
    const d = JSON.parse(storage?.getItem(draftMetaKey(pageId)) ?? 'null');
    return d && typeof d === 'object' ? d : null;
  } catch {
    return null;
  }
}

export function writeDraftMeta(storage, pageId, patch) {
  if (!storage || pageId == null) return null;
  const next = { ...(readDraftMeta(storage, pageId) || {}), ...(patch || {}) };
  try {
    storage.setItem(draftMetaKey(pageId), JSON.stringify(next));
  } catch {
    /* אחסון מלא/חסום — רק המטמון לא נשמר */
  }
  return next;
}

export function removeDraftMeta(storage, pageId) {
  try {
    storage?.removeItem(draftMetaKey(pageId));
  } catch {
    /* אחסון חסום */
  }
}

// הטיוטה המקומית ({ops, at}) במפתח, או null
export function readLocalDraft(storage, key) {
  try {
    const d = JSON.parse(storage?.getItem(key) ?? 'null');
    return d && Array.isArray(d.ops) ? d : null;
  } catch {
    return null;
  }
}

// איזו טיוטה ממשיכים: 'local' / 'server' / null (אין). meta.srv = מתי הטיוטה בשרת נשמרה/נטענה כאן בפעם האחרונה:
// אם השרת לא השתנה מאז — המקומית (אולי יש בה שינויים שעוד לא נשלחו). אחרת — החדשה מבין השתיים לפי הזמן, כשזמן
// הדפדפן מתורגם לשעון השרת (skewMs = שעון-השרת פחות שעון-הדפדפן, מהתשובה). טיוטה בשרת שהתרוקנה ("התחל מאפס" במחשב
// אחר) גוברת על מקומית ישנה ממנה.
export function pickDraft({ local, server, meta = null, skewMs = 0 }) {
  const hasLocal = !!local && Array.isArray(local.ops) && local.ops.length > 0;
  if (!server) return hasLocal ? 'local' : null;
  if (!hasLocal) return 'server';
  if (meta?.srv && meta.srv === server.updatedAt) return 'local';
  const st = Date.parse(server.updatedAt);
  const lt = Number(local.at);
  if (!Number.isFinite(st)) return 'local';
  if (!Number.isFinite(lt)) return 'server';
  return lt + (Number(skewMs) || 0) > st ? 'local' : 'server';
}

// העמוד חזר מזיהוי-מחדש והטיוטה בשרת עברה לגרסה החדשה (server.carried): היא הבסיס, ומה שנעשה בדפדפן הזה אחרי
// שהעמוד נשלח (recut.sentAt — למשל תיקון-מבנה שלא הספיק להישמר לפני השליחה) מצטרף אליה: הפעולות המקומיות שאין
// כמותן בשרת, אחריהן (המאוחרת גוברת). מקומית שאינה חדשה מהשליחה — השרת לבדו. ← רשימת-הפעולות
export function mergeCarried(serverOps, local, sentAt, skewMs = 0) {
  const base = Array.isArray(serverOps) ? serverOps : [];
  const lt = Number(local?.at);
  const st = Date.parse(sentAt || '');
  if (!Array.isArray(local?.ops) || !local.ops.length || !Number.isFinite(lt) || !Number.isFinite(st) || lt + (Number(skewMs) || 0) <= st) return base;
  const m = matchOps(base, local.ops);
  const extra = local.ops.filter((o, i) => m[i] < 0 && o && typeof o === 'object' && !o._local);
  return extra.length ? [...base, ...extra] : base;
}

// ---------- שתי עבודות על אותו עמוד (שתי לשוניות, שני מחשבים) ----------

// היעד של פעולה — מה היא משנה: סוג, שורות, ולסגנון-תו/גבול-פסקה גם הסגנון/המילה. שתי פעולות שונות על אותו יעד = סתירה
const targetKey = (o) => {
  const v = o?.value && typeof o.value === 'object' ? o.value : null;
  const sub = o?.kind === 'styles' ? [v?.style, v?.words] : o?.kind === 'para_break' ? [v?.word] : o?.kind === 'link_ok' || o?.kind === 'link_del' || o?.kind === 'link_reset' ? [v?.src_line] : null;
  return JSON.stringify([o?.kind, Array.isArray(o?.ids) ? o.ids : null, sub]);
};

const liveOp = (o) => o && typeof o === 'object' && !o._local;

// טביעה קצרה של פעולה (opKey ← FNV-1a): הבסיס של המיזוג נשמר ב-meta כרשימת טביעות, לא כפעולות שלמות
export const opHash = (o) => hash32(opKey(o)).toString(36);

// הגרסה המסונכרנת האחרונה (מה שנשמר באתר או נטען ממנו) ← רשימת הטביעות שלה (meta.base)
export const baseKeysOf = (ops) => (Array.isArray(ops) ? ops.filter(liveOp).map(opHash) : []);

// המקומית מול זו שבשרת, כששתיהן השתנו מאז הסנכרון האחרון. עם baseKeys (meta.base — הגרסה המסונכרנת האחרונה) — מיזוג
// משולש: פעולה שיש רק בצד אחד ושהייתה בבסיס — הצד השני הוריד אותה (ביטול גובר על "לא השתנה"), ושלא הייתה — הצד הזה
// הוסיף אותה. בלי בסיס (meta ישן) — השוואה של שתי רשימות כמו קודם (כל מה שיש רק כאן — תוספת).
// ← {local (תוספות כאן), server (תוספות שם), dropLocal (פעולות שירדו כאן — הורדו שם), dropServer (ירדו שם — הורדו
//    כאן), conflicts (תוספות כאן שסותרות תוספת שם על אותו יעד), merged (של השרת בלי מה שהורד כאן, ואחריו התוספות מכאן)}
export function diffDrafts(localOps, serverOps, baseKeys = null) {
  const L = Array.isArray(localOps) ? localOps : [];
  const S = Array.isArray(serverOps) ? serverOps : [];
  const mL = matchOps(S, L);
  const mS = matchOps(L, S);
  const onlyL = L.filter((o, i) => liveOp(o) && mL[i] < 0);
  const onlyS = S.filter((o, i) => liveOp(o) && mS[i] < 0);
  const inBase = () => {
    const left = new Map();
    for (const k of Array.isArray(baseKeys) ? baseKeys : []) left.set(k, (left.get(k) || 0) + 1);
    return (o) => {
      const k = opHash(o);
      const n = left.get(k) || 0;
      if (!n) return false;
      left.set(k, n - 1);
      return true;
    };
  };
  let local = onlyL;
  let server = onlyS;
  let dropLocal = [];
  let dropServer = [];
  if (Array.isArray(baseKeys)) {
    const bl = inBase();
    const bs = inBase();
    const wasL = onlyL.map(bl);
    const wasS = onlyS.map(bs);
    local = onlyL.filter((o, i) => !wasL[i]);
    dropLocal = onlyL.filter((o, i) => wasL[i]);
    server = onlyS.filter((o, i) => !wasS[i]);
    dropServer = onlyS.filter((o, i) => wasS[i]);
  }
  const theirs = new Set(server.map(targetKey));
  const conflicts = local.filter((o) => theirs.has(targetKey(o)));
  const gone = new Set(dropServer);
  const keep = gone.size ? S.filter((o) => !gone.has(o)) : S;
  return { local, server, dropLocal, dropServer, conflicts, merged: local.length || gone.size ? [...keep, ...local] : S };
}

// בפתיחת עמוד לעריכה (אחרי drafts.cleanupPageDrafts): הטיוטה מהשרת (server — publicDraft) מול המקומית שבמפתח —
// כשהשרת חדש יותר היא נכתבת למפתח (העורך קורא משם), ו-meta מתעדכן. העמוד חזר מזיהוי-מחדש והטיוטה בשרת עברה עכשיו לגרסה
// החדשה (server.carried) — היא קובעת, ומה שנעשה כאן אחרי השליחה מצטרף אליה (mergeCarried). ← {source, stage, srv,
// merged, conflict}: source — 'server' / 'local' / 'merged' / 'conflict' / null; stage — השלב השמור (או null); srv —
// updatedAt; merged — כמה פעולות מקומיות צורפו.
// שתי עבודות במקביל (docs/63 §2): הטיוטה בשרת השתנתה מאז הסנכרון האחרון כאן (meta.srv שונה, או שהשמירה האחרונה נדחתה
// כ-stale) וגם כאן השתנה משהו — לא בוחרים לפי שעון (אחת הייתה נדרסת): מיזוג משולש מול הבסיס שב-meta (diffDrafts —
// תוספת מכל צד נשמרת, והורדה מכל צד גוברת על "לא השתנה" בצד השני); בלי סתירות — מאחדים; עם סתירות — source 'conflict'
// ו-conflict {local, server, merged, n}, בלי לכתוב דבר: הדף שואל (שלי / של האתר / לאחד) וקורא ל-resolveDraftConflict.
export function applyServerDraft(storage, { pageId, draftKey, server, skewMs = 0 }) {
  const out = { source: null, stage: null, srv: server?.updatedAt ?? null, merged: 0 };
  if (!storage || !draftKey) return out;
  const local = readLocalDraft(storage, draftKey);
  const raw = readDraftMeta(storage, pageId);
  const meta = raw && raw.key === draftKey ? raw : null;
  // טיוטה בשרת שהתרוקנה ("התחל מאפס" במקום אחר) — החלטה מפורשת למחוק, לא עבודה מקבילה: לפי השעון, כמו תמיד
  const diverged =
    !!server && !server.carried && liveCount(server.ops) > 0 && !!local?.ops?.length && !!meta && (meta.stale === true || (!!meta.srv && meta.srv !== server.updatedAt));
  let forced = null;
  if (diverged) {
    const d = diffDrafts(local.ops, server.ops, Array.isArray(meta.base) ? meta.base : null);
    const here = d.local.length + d.dropServer.length;
    const there = d.server.length + d.dropLocal.length;
    if (here && there) {
      out.stage = server.stage ?? meta.stage ?? null;
      if (d.conflicts.length) {
        out.source = 'conflict';
        out.conflict = { local: local.ops, server: server.ops, merged: d.merged, n: d.conflicts.length, mine: d.local.length, theirs: d.server.length };
        return out;
      }
      writeOps(storage, draftKey, d.merged);
      // הבסיס הבא — מה שבשרת עכשיו (המאוחדת עוד לא נשמרה שם)
      writeDraftMeta(storage, pageId, { key: draftKey, srv: server.updatedAt, stage: out.stage, stale: false, base: baseKeysOf(server.ops) });
      out.source = 'merged';
      out.merged = d.local.length;
      return out;
    }
    // רק צד אחד השתנה באמת — הוא, בלי קשר לשעון
    forced = here ? 'local' : 'server';
    if (forced === 'local') writeDraftMeta(storage, pageId, { key: draftKey, srv: server.updatedAt, stale: false, base: baseKeysOf(server.ops) });
  }
  const source = server?.carried ? 'server' : forced || pickDraft({ local, server, meta, skewMs });
  out.source = source;
  if (source === 'server') {
    const ops = server.carried ? mergeCarried(server.ops, local, server.recut?.sentAt, skewMs) : server.ops;
    out.merged = ops.length - server.ops.length;
    try {
      if (ops.length) storage.setItem(draftKey, JSON.stringify({ ops, at: Date.now() }));
      else storage.removeItem(draftKey);
    } catch {
      /* אחסון חסום — העורך יתחיל בלי הטיוטה */
    }
    writeDraftMeta(storage, pageId, { key: draftKey, srv: server.updatedAt, stage: server.stage ?? null, base: baseKeysOf(server.ops) });
    out.stage = server.stage ?? null;
  } else {
    out.stage = meta?.stage ?? server?.stage ?? null;
    if (server && meta?.key !== draftKey) writeDraftMeta(storage, pageId, { key: draftKey, srv: null, stage: out.stage });
  }
  return out;
}
