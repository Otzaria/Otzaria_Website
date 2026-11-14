// צורת הדף — עיבוד חבילה ברקע (PACKAGE.md §1, §5): הרכבת package.zip מהחלקים, פריסה זורמת (fflate Unzip מקובץ
// על הדיסק — לעולם לא unzipSync של כל הקובץ), ואז העמודים, התמונות, ההחלטות והתרגול. ייבוא יחסי (node:test).
//
// סדר הקבצים ב-ZIP אינו מובטח (תמונה יכולה להגיע לפני pages.jsonl). לכן בשלב הפריסה: קובצי הטקסט (manifest,
// *.jsonl — קטנים יחסית) נאספים בזיכרון, וכל תמונה מוכרת (images/<dafKey>.<scan|ours>.<ext>, לפי תבנית קבועה —
// השם בתוך ה-ZIP לעולם אינו נתיב) נכתבת לתיקיית staging של ההעלאה. אחרי הפריסה: manifest נבדק, ולכל עמוד תקין
// התמונות עוברות מ-staging למקומן הסופי (public/uploads/tzurat-hadaf/<slug>/, קובץ זמני + rename) לפני העדכון
// של העמוד במסד. staging נמחק בסוף. הרצה חוזרת (retry) פורסת שוב מ-package.zip — הכול idempotent:
// עמודים לפי {slug, dafKey}, החלטות לפי sourceKey.
//
// כללי העדכון: עמוד קיים — התפיסות, ההגשות והמונים נשמרים; אם סומן changed וה-buildId שלו השתנה — סבב חדש
// (round+1, open, המונים מתאפסים; ההגשות הקודמות נשארות בהיסטוריה). החלטה קיימת: פתוחה (או obsolete שחזרה) —
// השדות מתעדכנים (והמילים — רק כשאין לה עדיין תשובות); החלטה שנסגרה (agreed/disputed/resolved/flagged) — לא
// נוגעים. full:true — החלטות פתוחות של המסכת שאינן בחבילה (ולא נוצרו באתר) ← obsolete.

import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import TzuratUpload from '../../models/TzuratUpload.js';
import TzuratBatch from '../../models/TzuratBatch.js';
import TzuratPage from '../../models/TzuratPage.js';
import TzuratItem from '../../models/TzuratItem.js';
import { ENTRY, imageEntry, parseJsonl, parseManifest, parsePageRecord, parseItemRecord, parsePracticeRecord, pushError } from './packageParse.js';
import { canRetry } from './uploadRules.js';
import { assemblePackage } from './uploads.js';
import { stagingDir, imageRelPath, imageFsPath, copyIntoPlace, exists } from './storage.js';
import { requiredFor } from './common.js';

const TEXT_ENTRIES = new Set(Object.values(ENTRY));
const MAX_MANIFEST = 1024 * 1024;
const MAX_JSONL = 64 * 1024 * 1024;
const MAX_UNPACKED = 512 * 1024 * 1024;
const MAX_IMAGE = 200 * 1024 * 1024;
const BEAT_MS = 5000;
const BULK = 500;
export const PRACTICE_PREFIX = 'practice:';

export class ImportError extends Error {}
// עבודה אחרת תפסה את ההעלאה (retry אחרי שהדופק של זו נעצר) — העבודה הזו נעצרת בלי לכתוב סטטוס
export class SupersededError extends Error {}

// ---------- פריסה ----------

/**
 * פריסה זורמת של zipPath: קובצי הטקסט ← Map(name → Buffer); תמונות ← staging/<dafKey>.<side>.<ext>.
 * onBeat(images) — נקרא מדי פעם (דופק). ← {texts, images: Set(fileName), ignored}
 */
export async function unzipToStaging(zipPath, staging, { onBeat = async () => {} } = {}) {
  await fs.rm(/*turbopackIgnore: true*/ staging, { recursive: true, force: true });
  await fs.mkdir(/*turbopackIgnore: true*/ staging, { recursive: true });
  const texts = new Map();
  const images = new Set();
  const writes = [];
  let unpacked = 0;
  let ignored = 0;
  let error = null;

  const consume = (file, cap, onChunk, done) => {
    let size = 0;
    file.ondata = (err, data, final) => {
      if (error) return;
      if (err) {
        error = new ImportError(`קובץ פגום בחבילה: ${file.name.slice(0, 80)}`);
        return;
      }
      size += data.length;
      unpacked += data.length;
      if (size > cap || unpacked > MAX_UNPACKED) {
        error = new ImportError(unpacked > MAX_UNPACKED ? 'החבילה גדולה מדי לאחר פריסה' : `קובץ גדול מדי בחבילה: ${file.name.slice(0, 80)}`);
        file.terminate();
        return;
      }
      if (data.length) onChunk(data);
      if (final) done();
    };
    file.start();
  };

  const uz = new Unzip((file) => {
    if (error) return;
    const name = file.name;
    if (TEXT_ENTRIES.has(name)) {
      const parts = [];
      consume(file, name === ENTRY.manifest ? MAX_MANIFEST : MAX_JSONL,
        (data) => parts.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength)),
        () => texts.set(name, Buffer.concat(parts)));
      return;
    }
    const img = imageEntry(name);
    if (img) {
      const fileName = `${img.dafKey}.${img.side}.${img.ext}`;
      const dest = path.join(/*turbopackIgnore: true*/ staging, fileName);
      let handlePromise;
      let chain = Promise.resolve();
      consume(file, MAX_IMAGE, (data) => {
        handlePromise ||= fs.open(/*turbopackIgnore: true*/ dest, 'w');
        const chunk = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        chain = chain.then(() => handlePromise).then((handle) => handle.write(chunk));
        writes.push(chain);
      }, () => {
        handlePromise ||= fs.open(/*turbopackIgnore: true*/ dest, 'w');
        const closing = chain.then(() => handlePromise).then((handle) => handle.close());
        writes.push(closing.then(() => images.add(fileName)));
      });
      return;
    }
    ignored++;
  });
  uz.register(UnzipPassThrough);
  uz.register(UnzipInflate);

  const flush = async () => {
    if (!writes.length) return;
    const pending = writes.splice(0);
    await Promise.all(pending);
  };

  let last = Date.now();
  for await (const chunk of createReadStream(/*turbopackIgnore: true*/ zipPath, { highWaterMark: 1024 * 1024 })) {
    uz.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    if (error) throw error;
    await flush();
    if (Date.now() - last > BEAT_MS) {
      last = Date.now();
      await onBeat(images.size);
    }
  }
  uz.push(new Uint8Array(0), true);
  if (error) throw error;
  await flush();
  return { texts, images, ignored };
}

// ---------- עיבוד ----------

function stagedName(images, dafKey, side, ext) {
  const name = `${dafKey}.${side}.${ext}`;
  return images.has(name) ? name : null;
}

// התמונה של צד אחד: מ-staging למקומה; ← הנתיב היחסי, או null אם אין (ואין קובץ קודם)
async function placeImage(ctx, slug, rec, side) {
  const ref = rec[side];
  if (!ref) return null;
  const rel = imageRelPath(slug, rec.dafKey, side, ref.ext);
  const staged = stagedName(ctx.images, rec.dafKey, side, ref.ext);
  if (staged) {
    await copyIntoPlace(path.join(/*turbopackIgnore: true*/ ctx.staging, staged), imageFsPath(rel));
    ctx.summary.images++;
    return rel;
  }
  return (await exists(imageFsPath(rel))) ? rel : null;
}

async function importPage(ctx, rec) {
  const { manifest } = ctx;
  const scanPath = await placeImage(ctx, manifest.slug, rec, 'scan');
  if (!scanPath) throw new ImportError(`${rec.dafKey}: תמונת הסריקה חסרה בחבילה`);
  const oursPath = await placeImage(ctx, manifest.slug, rec, 'ours');
  const fields = {
    masechet: manifest.masechet,
    daf: rec.daf,
    order: rec.order,
    pdf: rec.pdf,
    scan: { path: scanPath, w: rec.scan.w, h: rec.scan.h },
    ours: rec.ours && oursPath ? { path: oursPath, w: rec.ours.w, h: rec.ours.h } : null,
    nonVilna: rec.nonVilna,
    model: rec.model,
    required: requiredFor(manifest.slug, rec.dafKey),
  };
  const key = { slug: manifest.slug, dafKey: rec.dafKey };
  const prev = await TzuratPage.findOne(key, { buildId: 1, status: 1, round: 1 }).lean();
  if (!prev) {
    const r = await TzuratPage.updateOne(key, { $setOnInsert: { ...key, ...fields, buildId: manifest.buildId } }, { upsert: true });
    if (r.upsertedCount) {
      ctx.summary.pages.created++;
      return;
    }
  }
  // סבב חדש: העמוד השתנה (changed) ובבנייה אחרת. המסנן על buildId — הרצה חוזרת לא מעלה סבב פעמיים
  if (rec.changed && prev && prev.buildId !== manifest.buildId && prev.status !== 'closed') {
    const r = await TzuratPage.updateOne(
      { ...key, buildId: prev.buildId },
      {
        $set: {
          ...fields, buildId: manifest.buildId, status: 'open', activeCount: 0, approvedCount: 0,
          submitters: [], approvalEvents: [], releaseEvents: [], changedInRound: true,
        },
        $inc: { round: 1 },
      }
    );
    if (r.modifiedCount) {
      ctx.summary.pages.reopened++;
      return;
    }
  }
  await TzuratPage.updateOne(key, { $set: { ...fields, buildId: manifest.buildId } });
  ctx.summary.pages.updated++;
}

// החלטות: מכינים את הפעולות לפי המצב הקיים (מפה אחת למסכת), ושולחים ב-bulkWrite
async function importItems(ctx, records, { practice = false } = {}) {
  const { manifest, pageIds } = ctx;
  const keys = records.map((r) => (practice ? PRACTICE_PREFIX : '') + r.sourceKey);
  const existing = new Map();
  for (let i = 0; i < keys.length; i += 5000) {
    const rows = await TzuratItem.aggregate([
      { $match: { sourceKey: { $in: keys.slice(i, i + 5000) } } },
      { $project: { sourceKey: 1, status: 1, na: { $size: '$answers' } } },
    ]);
    for (const r of rows) existing.set(r.sourceKey, r);
  }
  let ops = [];
  const send = async () => {
    if (!ops.length) return;
    const batch = ops;
    ops = [];
    try {
      await TzuratItem.bulkWrite(batch, { ordered: false });
    } catch (e) {
      throw new ImportError(`שמירת החלטות נכשלה בחלקה: ${e?.message?.slice(0, 120) || e?.name}`);
    }
  };
  for (let k = 0; k < records.length; k++) {
    const r = records[k];
    const sourceKey = keys[k];
    const page = pageIds.get(r.dafKey);
    const fields = {
      slug: manifest.slug,
      masechet: manifest.masechet,
      daf: page?.daf || '',
      dafKey: r.dafKey,
      page: page?._id || null,
      kind: r.kind,
      ctxBefore: r.ctxBefore,
      ctxAfter: r.ctxAfter,
      box: r.box,
      score: r.score,
      hints: r.hints,
      buildId: manifest.buildId,
    };
    const text = { cls: r.cls, question: r.question, ref: r.ref, wi: r.wi, n: r.n, otz: r.otz, print: r.print };
    const prev = existing.get(sourceKey);
    if (practice) {
      ops.push({
        updateOne: {
          filter: { sourceKey },
          update: { $set: { ...fields, ...text, practice: true, status: 'open', expected: r.expected, expectedText: r.expectedText, explain: r.explain } },
          upsert: true,
        },
      });
      ctx.summary.practice++;
    } else if (!prev) {
      ops.push({ updateOne: { filter: { sourceKey }, update: { $setOnInsert: { sourceKey, ...fields, ...text, status: 'open' } }, upsert: true } });
      ctx.summary.items.created++;
    } else if (prev.status === 'open' && prev.na) {
      // פתוחה עם תשובות: המתנדבים ענו על מה שראו — המקום, ההקשר והמילים לא משתנים; רק הדירוג והרמזים
      ops.push({ updateOne: { filter: { sourceKey, status: 'open' }, update: { $set: { score: r.score, hints: r.hints, buildId: manifest.buildId } } } });
      ctx.summary.items.updated++;
    } else if (prev.status === 'open') {
      // פתוחה בלי תשובות — הכול מתעדכן (התנאי answers ריק — תשובה שנוספה בינתיים מבטלת את העדכון)
      ops.push({ updateOne: { filter: { sourceKey, status: 'open', answers: { $size: 0 } }, update: { $set: { ...fields, ...text }, $inc: { revision: 1 } } } });
      ctx.summary.items.updated++;
    } else if (prev.status === 'obsolete') {
      // החייאה: שאלה חדשה ונקייה (התשובות הישנות היו לגרסה אחרת)
      ops.push({
        updateOne: {
          filter: { sourceKey, status: 'obsolete' },
          update: { $set: { ...fields, ...text, status: 'open', answers: [], decision: null, resolved: null, flag: null, flags: [], pointsAwarded: false }, $inc: { revision: 1 } },
        },
      });
      ctx.summary.items.revived++;
    } else {
      ctx.summary.items.skippedAnswered++;
    }
    if (ops.length >= BULK) {
      await send();
      await ctx.beat();
    }
  }
  await send();
}

async function recountPages(slug) {
  const rows = await TzuratItem.aggregate([
    { $match: { slug, status: 'open', practice: { $ne: true }, page: { $ne: null } } },
    { $group: { _id: '$page', n: { $sum: 1 } } },
  ]);
  await TzuratPage.updateMany({ slug }, { $set: { pendingCount: 0 } });
  const ops = rows.map((r) => ({ updateOne: { filter: { _id: r._id }, update: { $set: { pendingCount: r.n } } } }));
  for (let i = 0; i < ops.length; i += BULK) await TzuratPage.bulkWrite(ops.slice(i, i + BULK), { ordered: false });
}

/**
 * עבודת הייבוא של העלאה אחת (נקרא מ-after() של complete/retry). לא זורק: כל כשל נרשם בהעלאה (failed).
 * ← הסיכום, או null אם העבודה כבר רצה במקום אחר.
 */
export async function processUpload(uploadId, { now = () => new Date(), keepStaging = false } = {}) {
  // תפיסת העבודה: רק queued (או עבודה שנתקעה בלי דופק). runToken — מזהה הריצה: כל דופק וכל כתיבת סטטוס
  // מותנים בו, ו-staging נפרד לכל ריצה — שתי ריצות במקביל אינן דורסות זו את זו
  const runToken = randomBytes(8).toString('hex');
  const up0 = await TzuratUpload.findById(uploadId).lean();
  if (!up0) return null;
  if (up0.status !== 'queued' && !(up0.status === 'processing' && canRetry(up0, now()))) return null;
  const up = await TzuratUpload.findOneAndUpdate(
    { _id: up0._id, status: up0.status, updatedAt: up0.updatedAt },
    {
      $set: {
        status: 'processing',
        runToken,
        startedAt: now(),
        heartbeatAt: now(),
        finishedAt: null,
        errorList: [],
        summary: null,
        progress: { pages: 0, items: 0, images: 0 },
      },
    },
    { returnDocument: 'after', lean: true }
  );
  if (!up) return null;

  const errors = [];
  const summary = {
    slug: null,
    buildId: null,
    full: false,
    pages: { created: 0, updated: 0, reopened: 0 },
    items: { created: 0, updated: 0, revived: 0, skippedAnswered: 0, obsoleted: 0, keptAnswered: 0 },
    practice: 0,
    images: 0,
    ignored: 0,
    errors: 0,
  };
  const staging = `${stagingDir(up._id)}-${runToken}`;
  const mine = { _id: up._id, status: 'processing', runToken };
  // images — בזמן הפריסה: כמה נפרסו; אחר כך: כמה הועברו למקומן
  let unzipped = 0;
  const progress = () => ({
    pages: summary.pages.created + summary.pages.updated + summary.pages.reopened,
    items: summary.items.created + summary.items.updated + summary.items.revived + summary.items.skippedAnswered,
    images: summary.images || unzipped,
  });
  let lastBeat = 0;
  const beat = async (force = false) => {
    if (!force && Date.now() - lastBeat < BEAT_MS) return;
    lastBeat = Date.now();
    const r = await TzuratUpload.updateOne(mine, { $set: { heartbeatAt: now(), progress: progress() } });
    if (!r.matchedCount) throw new SupersededError('superseded');
  };

  try {
    const zip = await assemblePackage(up, { onBeat: () => beat() });
    const { texts, images, ignored } = await unzipToStaging(zip.path, staging, {
      onBeat: async (n) => {
        unzipped = n;
        await beat(true);
      },
    });
    summary.ignored = ignored;

    // manifest
    const rawManifest = texts.get(ENTRY.manifest);
    if (!rawManifest) throw new ImportError('manifest.json חסר בחבילה');
    let manifestJson;
    try {
      manifestJson = JSON.parse(rawManifest.toString('utf8'));
    } catch {
      throw new ImportError('manifest.json אינו JSON תקין');
    }
    const m = parseManifest(manifestJson);
    if (m.error) throw new ImportError(m.error);
    const manifest = m.value;
    summary.slug = manifest.slug;
    summary.buildId = manifest.buildId;
    summary.full = manifest.full;

    for (const name of [ENTRY.pages, ENTRY.items]) {
      if (!texts.has(name)) throw new ImportError(`${name} חסר בחבילה`);
    }
    const pageLines = parseJsonl(texts.get(ENTRY.pages).toString('utf8'));
    const itemLines = parseJsonl(texts.get(ENTRY.items).toString('utf8'));
    for (const [name, lines, count] of [[ENTRY.pages, pageLines, manifest.pages], [ENTRY.items, itemLines, manifest.items]]) {
      if (count !== null && (count < 0 || count !== lines.length)) throw new ImportError(`${name}: מספר הרשומות אינו תואם ל-manifest`);
    }
    // A malformed full package must never retire questions omitted by a broken/truncated record.
    const safeFull = !itemLines.some((l) => l.error || parseItemRecord(l.value, manifest.slug).error);

    const ctx = { manifest, images, staging, summary, errors, pageIds: new Map(), beat };

    // עמודים
    if (!pageLines.length) throw new ImportError('pages.jsonl חסר או ריק');
    for (const l of pageLines) {
      if (l.error) {
        pushError(errors, `pages.jsonl שורה ${l.line}: ${l.error}`);
        continue;
      }
      const p = parsePageRecord(l.value);
      if (p.error) {
        pushError(errors, `pages.jsonl שורה ${l.line}: ${p.error}`);
        continue;
      }
      try {
        await importPage(ctx, p.value);
      } catch (e) {
        throw new ImportError(`pages.jsonl שורה ${l.line}: ${e instanceof ImportError ? e.message : e?.message || e?.name}`);
      }
      await beat();
    }
    // כל העמודים של המסכת (גם מחבילות קודמות) — להחלטות
    const allPages = await TzuratPage.find({ slug: manifest.slug }, { dafKey: 1, daf: 1 }).lean();
    for (const p of allPages) ctx.pageIds.set(p.dafKey, p);

    // החלטות
    const keep = new Set();
    const itemRecs = [];
    for (const l of itemLines) {
      if (l.error) {
        pushError(errors, `items.jsonl שורה ${l.line}: ${l.error}`);
        continue;
      }
      // גם רשומה פגומה שומרת על הפריט שלה מ-obsolete
      if (typeof l.value?.sourceKey === 'string') keep.add(l.value.sourceKey);
      const r = parseItemRecord(l.value, manifest.slug);
      if (r.error) {
        pushError(errors, `items.jsonl שורה ${l.line}: ${r.error}`);
        continue;
      }
      if (!ctx.pageIds.has(r.value.dafKey)) {
        pushError(errors, `items.jsonl שורה ${l.line}: העמוד ${r.value.dafKey} אינו במסכת`);
        continue;
      }
      itemRecs.push(r.value);
    }
    await importItems(ctx, itemRecs);

    // תרגול (אופציונלי)
    const practiceRecs = [];
    for (const l of parseJsonl(texts.get(ENTRY.practice)?.toString('utf8') || '')) {
      if (l.error) {
        pushError(errors, `practice.jsonl שורה ${l.line}: ${l.error}`);
        continue;
      }
      const r = parsePracticeRecord(l.value, manifest.slug);
      if (r.error) pushError(errors, `practice.jsonl שורה ${l.line}: ${r.error}`);
      else practiceRecs.push(r.value);
    }
    if (practiceRecs.length) await importItems(ctx, practiceRecs, { practice: true });

    // full — החלטות פתוחות שאינן בחבילה
    if (manifest.full && safeFull && !errors.length) {
      // פריט שכבר יש לו תשובות אינו נזרק (keptAnswered) — המנהל יחליט עליו
      const gone = { slug: manifest.slug, status: 'open', practice: { $ne: true }, manual: { $ne: true }, sourceKey: { $nin: [...keep] } };
      const r = await TzuratItem.updateMany({ ...gone, 'answers.0': { $exists: false } }, { $set: { status: 'obsolete', leasedBy: null, leasedUntil: null } });
      summary.items.obsoleted = r.modifiedCount || 0;
      summary.items.keptAnswered = await TzuratItem.countDocuments({ ...gone, 'answers.0': { $exists: true } });
    }
    await recountPages(manifest.slug);

    // החבילה (מסכת × בנייה)
    const [pagesN, itemsN] = await Promise.all([
      TzuratPage.countDocuments({ slug: manifest.slug }),
      TzuratItem.countDocuments({ slug: manifest.slug, practice: { $ne: true }, status: { $ne: 'obsolete' } }),
    ]);
    await TzuratBatch.updateOne(
      { slug: manifest.slug },
      {
        $set: { masechet: manifest.masechet, buildId: manifest.buildId, order: manifest.order, importedAt: now(), importedBy: up.by || null, pages: pagesN, items: itemsN },
        $setOnInsert: { slug: manifest.slug, status: 'active' },
      },
      { upsert: true }
    );

    summary.errors = errors.length;
    await TzuratUpload.updateOne(
      mine,
      { $set: { status: 'done', finishedAt: now(), heartbeatAt: now(), summary, errorList: errors.slice(0, 20), progress: progress() } }
    );
    return summary;
  } catch (e) {
    if (e instanceof SupersededError) return null;
    if (!(e instanceof ImportError)) console.error('tzurat import', e);
    pushError(errors, e instanceof ImportError ? e.message : `שגיאה בעיבוד החבילה: ${e?.message?.slice(0, 160) || e?.name}`);
    summary.errors = errors.length;
    await TzuratUpload.updateOne(
      mine,
      { $set: { status: 'failed', finishedAt: now(), heartbeatAt: now(), summary, errorList: errors.slice(0, 20), progress: progress() } }
    ).catch(() => {});
    return summary;
  } finally {
    if (!keepStaging) await fs.rm(/*turbopackIgnore: true*/ staging, { recursive: true, force: true }).catch(() => {});
  }
}
