// צורת הדף — העלאה מחולקת של חבילה (CONTRACT "ניהול": uploads). כל חלק נכתב לקובץ משלו בזרימה (בלי לשמור את
// הגוף בזיכרון), עם תקרה מדויקת לגודל, דרך קובץ זמני ו-rename — כך ששליחה חוזרת של אותו חלק בטוחה.
// complete רק בודק שכל החלקים על הדיסק ומעביר ל-queued; ההרכבה (package.zip) והייבוא — ברקע (importPackage.js).
// ייבוא יחסי (node:test).

import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import TzuratUpload from '../../models/TzuratUpload.js';
import { validateCreate, chunkIndex, expectedChunkSize, missingChunks, canRetry, UPLOAD_TTL_DAYS } from './uploadRules.js';
import { uploadDir, uploadsRoot, chunkPath, packagePath, exists } from './storage.js';
import { isObjectId, cleanText, OBJECT_ID_RE } from './common.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error, code) => ({ ok: false, status, error, ...(code ? { code } : {}) });
const DAY_MS = 24 * 60 * 60 * 1000;

export class ChunkSizeError extends Error {}

export async function createUpload(body, admin) {
  const v = validateCreate(body);
  if (v.error) return fail(400, v.error);
  const doc = await TzuratUpload.create({
    name: v.name,
    size: v.size,
    chunkSize: v.chunkSize,
    chunks: v.chunks,
    by: isObjectId(String(admin?.id)) ? oid(admin.id) : null,
    byName: cleanText(admin?.name, 100),
  });
  await fs.mkdir(/*turbopackIgnore: true*/ uploadDir(doc._id), { recursive: true });
  return { ok: true, upload: doc.toObject() };
}

export async function getUpload(id) {
  if (!isObjectId(String(id))) return null;
  return TzuratUpload.findById(id).lean();
}

// גוף הבקשה (ReadableStream/AsyncIterable של Uint8Array) ← אותם חלקים, עם תקרה
async function* capped(body, max) {
  let total = 0;
  for await (const chunk of body) {
    const c = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    total += c.byteLength;
    if (total > max) throw new ChunkSizeError('too_large');
    yield c;
  }
}

/** חלק n: body — הגוף הגולמי. ← {ok, received} או fail(400/404/409/413) */
export async function writeChunk(id, rawN, body, { contentLength = null } = {}) {
  const up = await getUpload(id);
  if (!up) return fail(404, 'ההעלאה לא נמצאה');
  if (up.status !== 'uploading') return fail(409, 'ההעלאה כבר הושלמה', 'not_uploading');
  const n = chunkIndex(rawN, up.chunks);
  if (n === null) return fail(400, 'מספר חלק לא תקין');
  const expected = expectedChunkSize(n, up.size, up.chunkSize, up.chunks);
  if (contentLength != null && Number.isFinite(contentLength) && contentLength !== expected) {
    return fail(contentLength > expected ? 413 : 400, `גודל החלק שגוי (צפוי ${expected} בתים)`);
  }
  if (!body) return fail(400, 'גוף הבקשה חסר');
  const dest = chunkPath(up._id, n);
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  let written = 0;
  try {
    const out = createWriteStream(/*turbopackIgnore: true*/ tmp, { flags: 'wx' });
    await pipeline(
      (async function* () {
        for await (const c of capped(body, expected)) {
          written += c.byteLength;
          yield c;
        }
      })(),
      out
    );
    if (written !== expected) {
      await fs.rm(/*turbopackIgnore: true*/ tmp, { force: true });
      return fail(400, `החלק הגיע חסר (${written} מתוך ${expected} בתים) — שלחו אותו שוב`);
    }
    await fs.rename(/*turbopackIgnore: true*/ tmp, dest);
  } catch (e) {
    await fs.rm(/*turbopackIgnore: true*/ tmp, { force: true }).catch(() => {});
    if (e instanceof ChunkSizeError) return fail(413, `החלק גדול מדי (עד ${expected} בתים)`);
    if (e?.code === 'ENOSPC') return fail(503, 'אין מקום בדיסק בשרת');
    throw e;
  }
  const doc = await TzuratUpload.findOneAndUpdate(
    { _id: up._id, status: 'uploading' },
    { $addToSet: { received: n } },
    { returnDocument: 'after', lean: true }
  );
  if (!doc) return fail(409, 'ההעלאה כבר הושלמה', 'not_uploading');
  return { ok: true, received: [...doc.received].sort((a, b) => a - b) };
}

/** כל החלקים התקבלו ונמצאים בגודל הנכון ← queued (העיבוד ברקע). ← {ok, upload} */
export async function completeUpload(id, now = new Date()) {
  const up = await getUpload(id);
  if (!up) return fail(404, 'ההעלאה לא נמצאה');
  if (up.status !== 'uploading') return fail(409, 'ההעלאה כבר הושלמה', 'not_uploading');
  const missing = missingChunks(up.received, up.chunks);
  if (missing.length) return fail(409, `חסרים חלקים: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`, 'missing_chunks');
  for (let n = 0; n < up.chunks; n++) {
    const st = await fs.stat(/*turbopackIgnore: true*/ chunkPath(up._id, n)).catch(() => null);
    if (!st || st.size !== expectedChunkSize(n, up.size, up.chunkSize, up.chunks)) {
      await TzuratUpload.updateOne({ _id: up._id }, { $pull: { received: n } });
      return fail(409, `חלק ${n} חסר או פגום בשרת — שלחו אותו שוב`, 'missing_chunks');
    }
  }
  const doc = await TzuratUpload.findOneAndUpdate(
    { _id: up._id, status: 'uploading' },
    { $set: { status: 'queued', heartbeatAt: now, errorList: [] } },
    { returnDocument: 'after', lean: true }
  );
  if (!doc) return fail(409, 'ההעלאה כבר הושלמה', 'not_uploading');
  return { ok: true, upload: doc };
}

/** הרצה חוזרת של הייבוא (נכשל, הסתיים, או נתקע בלי דופק) ← {ok, upload} */
export async function requeueUpload(id, now = new Date()) {
  const up = await getUpload(id);
  if (!up) return fail(404, 'ההעלאה לא נמצאה');
  if (!canRetry(up, now)) return fail(409, up.status === 'uploading' ? 'ההעלאה עוד לא הושלמה' : 'הייבוא רץ כרגע', 'busy');
  // צריך את package.zip, או את כל החלקים (אם ההרכבה עוד לא קרתה)
  let present = await exists(packagePath(up._id));
  for (let n = 0; !present && n < up.chunks; n++) {
    if (!(await exists(chunkPath(up._id, n)))) break;
    if (n === up.chunks - 1) present = true;
  }
  if (!present) return fail(409, 'קובצי ההעלאה כבר נמחקו — העלו את החבילה מחדש', 'gone');
  const doc = await TzuratUpload.findOneAndUpdate(
    { _id: up._id, status: up.status, updatedAt: up.updatedAt },
    { $set: { status: 'queued', heartbeatAt: now, finishedAt: null } },
    { returnDocument: 'after', lean: true }
  );
  if (!doc) return fail(409, 'מצב ההעלאה השתנה בינתיים — רעננו', 'busy');
  return { ok: true, upload: doc };
}

/** הרכבת package.zip מהחלקים (זרימה; sha256 בדרך). חלקים נמחקים אחרי ההצלחה. ← {path, sha256} */
export async function assemblePackage(up, { onBeat = async () => {} } = {}) {
  const dest = packagePath(up._id);
  if (await exists(dest)) return { path: dest, sha256: up.sha256 || '' };
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  const hash = createHash('sha256');
  try {
    const out = createWriteStream(/*turbopackIgnore: true*/ tmp, { flags: 'wx' });
    await pipeline(
      (async function* () {
        for (let n = 0; n < up.chunks; n++) {
          for await (const c of createReadStream(/*turbopackIgnore: true*/ chunkPath(up._id, n))) {
            hash.update(c);
            yield c;
          }
          // דופק בין חלקים (וגם בדיקה שהריצה עדיין שלנו — זורק אם לא)
          await onBeat();
        }
      })(),
      out
    );
    const st = await fs.stat(/*turbopackIgnore: true*/ tmp);
    if (st.size !== up.size) throw new Error(`גודל החבילה אחרי ההרכבה (${st.size}) שונה מהמוצהר (${up.size})`);
    await fs.rename(/*turbopackIgnore: true*/ tmp, dest);
  } catch (e) {
    await fs.rm(/*turbopackIgnore: true*/ tmp, { force: true }).catch(() => {});
    throw e;
  }
  for (let n = 0; n < up.chunks; n++) await fs.rm(/*turbopackIgnore: true*/ chunkPath(up._id, n), { force: true }).catch(() => {});
  const sha256 = hash.digest('hex');
  await TzuratUpload.updateOne({ _id: up._id }, { $set: { sha256 } });
  return { path: dest, sha256 };
}

/**
 * ניקוי: קובצי העלאות בנות יותר מ-UPLOAD_TTL_DAYS ימים נמחקים (הרשומה נשארת לתיעוד; העלאה שלא הושלמה
 * מסומנת failed), וכך גם תיקיות יתומות. עבודה שרצה עכשיו אינה נוגעת. ← {removed, expired}
 */
export async function cleanupOldUploads(now = new Date(), { ttlDays = UPLOAD_TTL_DAYS } = {}) {
  const cutoff = new Date(now.getTime() - ttlDays * DAY_MS);
  const old = await TzuratUpload.find({ createdAt: { $lt: cutoff }, status: { $ne: 'processing' } }, { _id: 1, status: 1 }).lean();
  let removed = 0;
  let expired = 0;
  for (const u of old) {
    const dir = uploadDir(u._id);
    if (await exists(dir)) {
      await fs.rm(/*turbopackIgnore: true*/ dir, { recursive: true, force: true });
      removed++;
    }
    if (u.status === 'uploading' || u.status === 'queued') {
      const r = await TzuratUpload.updateOne(
        { _id: u._id, status: u.status },
        { $set: { status: 'failed', finishedAt: now }, $push: { errorList: { $each: ['ההעלאה פגה ונמחקה (שבוע בלי השלמה)'], $slice: 20 } } }
      );
      expired += r.modifiedCount;
    }
  }
  // תיקיות שאין להן רשומה (או שהרשומה נמחקה)
  const root = uploadsRoot();
  const names = await fs.readdir(/*turbopackIgnore: true*/ root).catch(() => []);
  for (const name of names) {
    if (!OBJECT_ID_RE.test(name)) continue;
    const st = await fs.stat(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ root, name)).catch(() => null);
    if (!st || st.mtime >= cutoff) continue;
    if (await TzuratUpload.exists({ _id: oid(name) })) continue;
    await fs.rm(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ root, name), { recursive: true, force: true });
    removed++;
  }
  return { removed, expired };
}
