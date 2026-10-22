// מיגרציה לשדה active ולאינדקס הייחודי החלקי book_active_unique ב-OcrJob (ספק OCR local).
// נתיבים יחסיים (לא '@/') — נטען מ-scripts/migrate-ocr-local.mjs ומטסט node:test.
//
// אידמפוטנטית ולא הרסנית: ברירת המחדל היא דוח בלבד (apply:false). שום עבודה לא נמחקת;
// האינדקס הישן נמחק רק אחרי שווידאנו שאין כפילויות פעילות לאותו ספר.
//
// סדר ההרצה (migrateOcrLocal):
//   1. findDuplicateActive — אם יש ספר עם יותר מעבודה פעילה אחת, עוצרים עם דוח (בלי לשנות
//      דבר), אלא אם failOlderDuplicates — ואז העבודות הישנות מסומנות failed + active:false.
//   2. backfillActive — active נקבע לרשומות שאין להן את השדה: true אם status='running'.
//   3. swapActiveIndex — מחיקת { book:1 } partial { status:'running' } (לפי מפתח ו-filter,
//      לא לפי שם) ויצירת האינדקסים החדשים (createIndex אידמפוטנטי).
//   4. ensurePageResultIndexes — אינדקסי האוסף OcrPageResult (נתוני פריסה/עזר לכל עמוד).
import mongoose from 'mongoose';
import OcrJob from '../../models/OcrJob.js';
import OcrPageResult from '../../models/OcrPageResult.js';
import { activeFilter } from './localJobState.js';

export const LEGACY_INDEX_FILTER = Object.freeze({ status: 'running' });

// האינדקסים שהמיגרציה מבטיחה (תואמים להגדרות ב-src/models/OcrJob.js). הסדר חשוב:
// book_active_unique ראשון — הוא ההגנה מפני שתי עבודות פעילות לאותו ספר.
export const TARGET_INDEXES = Object.freeze([
  {
    key: { book: 1 },
    options: { name: 'book_active_unique', unique: true, partialFilterExpression: { active: true } },
  },
  {
    key: { requestId: 1 },
    options: {
      name: 'requestId_unique',
      unique: true,
      partialFilterExpression: { requestId: { $type: 'string' } },
    },
  },
  { key: { method: 1, workerId: 1, active: 1, _id: 1 }, options: {} },
  { key: { method: 1, active: 1, ackAt: 1 }, options: {} },
]);

// אינדקסי OcrPageResult (תואמים ל-src/models/OcrPageResult.js — נבדק בטסט). אוסף חדש, ולכן אין
// אינדקס ישן להחליף: רק יצירה אידמפוטנטית (autoIndex של האפליקציה יוצר אותם ממילא).
export const PAGE_RESULT_INDEXES = Object.freeze([
  { key: { job: 1, page: 1 }, options: { unique: true } },
  { key: { page: 1, createdAt: -1 }, options: {} },
  { key: { book: 1 }, options: {} },
]);

const DUPLICATE_FAIL_ERROR = 'סומנה ככשל במיגרציה: עבודה פעילה נוספת לאותו ספר (נשמרה החדשה ביותר)';

// שם ברירת המחדל של MongoDB לאינדקס בלי name (למשל method_1_workerId_1_active_1__id_1)
export function defaultIndexName(key) {
  return Object.entries(key)
    .map(([field, dir]) => `${field}_${dir}`)
    .join('_');
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isLegacyBookIndex(index) {
  return (
    sameJson(index.key, { book: 1 }) &&
    !!index.partialFilterExpression &&
    sameJson(index.partialFilterExpression, LEGACY_INDEX_FILTER)
  );
}

async function listIndexes(model = OcrJob) {
  try {
    return await model.collection.indexes();
  } catch (err) {
    // האוסף עוד לא קיים (DB ריק) — אין אינדקסים
    if (err?.code === 26 || err?.codeName === 'NamespaceNotFound') return [];
    throw err;
  }
}

// ספרים עם יותר מעבודה פעילה אחת. "פעילה" לפי activeFilter — כולל רשומות ישנות בלי active
// שב-running, כך שהבדיקה נכונה גם לפני ה-backfill (מה שה-backfill עומד להפוך לפעיל).
export async function findDuplicateActive() {
  const groups = await OcrJob.collection
    .aggregate([
      { $match: activeFilter() },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: '$book',
          count: { $sum: 1 },
          jobs: {
            $push: { _id: '$_id', status: '$status', method: '$method', createdAt: '$createdAt' },
          },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  return groups.map((g) => ({
    book: String(g._id),
    count: g.count,
    // הראשונה — החדשה ביותר (נשמרת); השאר — ישנות
    jobs: g.jobs.map((j) => ({
      _id: String(j._id),
      status: j.status,
      method: j.method,
      createdAt: j.createdAt ?? null,
    })),
  }));
}

// מסמן failed + active:false את כל העבודות הפעילות בכל קבוצת כפילות חוץ מהחדשה ביותר
export async function failOlderDuplicates(duplicates, { apply, now = new Date() }) {
  const ids = duplicates.flatMap((d) => d.jobs.slice(1).map((j) => j._id));
  if (!apply || ids.length === 0) return { jobIds: ids, modified: 0, applied: false };
  const res = await OcrJob.collection.updateMany(
    { _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) }, ...activeFilter() },
    { $set: { status: 'failed', active: false, error: DUPLICATE_FAIL_ERROR, finishedAt: now } }
  );
  return { jobIds: ids, modified: res.modifiedCount, applied: true };
}

// active לרשומות שאין להן את השדה: true אם status='running', אחרת false
export async function backfillActive({ apply }) {
  const coll = OcrJob.collection;
  const missing = { active: { $exists: false } };
  const [total, running] = await Promise.all([
    coll.countDocuments(missing),
    coll.countDocuments({ ...missing, status: 'running' }),
  ]);
  const report = { missing: total, toActiveTrue: running, toActiveFalse: total - running };
  if (!apply || total === 0) return { ...report, modified: 0, applied: false };
  const res = await coll.updateMany(missing, [
    { $set: { active: { $eq: ['$status', 'running'] } } },
  ]);
  return { ...report, modified: res.modifiedCount, applied: true };
}

// תכנון שינויי האינדקסים מול המצב הנוכחי (טהור — לבדיקות ולדוח ה-dry-run)
export function planIndexChanges(existing) {
  const toDrop = existing.filter(isLegacyBookIndex).map((i) => i.name);
  const names = new Set(existing.map((i) => i.name));
  const toCreate = TARGET_INDEXES.filter(
    ({ key, options }) => !names.has(options.name || defaultIndexName(key))
  ).map(({ key, options }) => options.name || defaultIndexName(key));
  return { toDrop, toCreate };
}

// מחליף את האינדקס הישן בחדש. עוצר (בלי לגעת באינדקסים) אם יש כפילויות פעילות.
export async function swapActiveIndex({ apply }) {
  const duplicates = await findDuplicateActive();
  const existing = await listIndexes();
  const plan = planIndexChanges(existing);
  if (duplicates.length > 0) {
    return { ok: false, reason: 'duplicates', duplicates, ...plan, dropped: [], created: [], applied: false };
  }
  if (!apply) return { ok: true, ...plan, dropped: [], created: [], applied: false };

  const dropped = [];
  for (const name of plan.toDrop) {
    await OcrJob.collection.dropIndex(name);
    dropped.push(name);
  }
  const created = [];
  for (const { key, options } of TARGET_INDEXES) {
    const name = options.name || defaultIndexName(key);
    // createIndex אידמפוטנטי: אינדקס זהה קיים → no-op
    await OcrJob.collection.createIndex(key, { ...options, name });
    if (plan.toCreate.includes(name)) created.push(name);
  }
  return { ok: true, ...plan, dropped, created, applied: true };
}

// יצירת אינדקסי OcrPageResult שחסרים (createIndex אידמפוטנטי). dry-run — דוח בלבד.
export async function ensurePageResultIndexes({ apply }) {
  const names = new Set((await listIndexes(OcrPageResult)).map((i) => i.name));
  const toCreate = PAGE_RESULT_INDEXES.map(({ key, options }) => options.name || defaultIndexName(key)).filter(
    (name) => !names.has(name)
  );
  if (!apply) return { toCreate, created: [], applied: false };
  const created = [];
  for (const { key, options } of PAGE_RESULT_INDEXES) {
    const name = options.name || defaultIndexName(key);
    await OcrPageResult.collection.createIndex(key, { ...options, name });
    if (toCreate.includes(name)) created.push(name);
  }
  return { toCreate, created, applied: true };
}

// הזרימה המלאה של הסקריפט. מחזירה דוח JSON; changes=false אם אין מה לעשות.
export async function migrateOcrLocal({ apply = false, failOlder = false, now = new Date() } = {}) {
  const duplicates = await findDuplicateActive();
  if (duplicates.length > 0 && !failOlder) {
    return {
      ok: false,
      applied: false,
      stoppedAt: 'duplicates',
      message:
        'נמצאו ספרים עם יותר מעבודת OCR פעילה אחת — לא בוצע דבר. יש לטפל בהן ידנית או להריץ עם --fail-older-duplicates',
      duplicates,
    };
  }

  const duplicateFix = await failOlderDuplicates(duplicates, { apply, now });
  const backfill = await backfillActive({ apply });

  // ב-dry-run עם כפילויות שעוד לא תוקנו — מתכננים את האינדקסים בלי בדיקת הכפילויות
  // (הן היו מתוקנות בהרצה האמיתית לפני ההחלפה)
  let index;
  if (!apply && duplicates.length > 0) {
    index = { ok: true, ...planIndexChanges(await listIndexes()), dropped: [], created: [], applied: false };
  } else {
    index = await swapActiveIndex({ apply });
  }
  // אינדקסי OcrPageResult — רק אם האינדקסים של OcrJob לא נעצרו (כפילויות)
  const pageResultIndex = index.ok
    ? await ensurePageResultIndexes({ apply })
    : { toCreate: [], created: [], applied: false };

  const changes =
    duplicateFix.jobIds.length > 0 ||
    backfill.missing > 0 ||
    index.toDrop.length > 0 ||
    index.toCreate.length > 0 ||
    pageResultIndex.toCreate.length > 0;

  return {
    ok: index.ok,
    applied: apply,
    changes,
    duplicates,
    duplicateFix,
    backfill,
    index,
    pageResultIndex,
  };
}
