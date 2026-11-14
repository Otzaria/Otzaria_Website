import fs from 'fs-extra';
import { randomBytes } from 'node:crypto';
import TrainingProofItem from '@/models/TrainingProofItem';
import TrainingProofPackage from '@/models/TrainingProofPackage';
import TrainingProofBook from '@/models/TrainingProofBook';
import { resolveImageFsPath } from '@/lib/ocr/images';
import { checkToSiteZip, checkZipSize } from '@/lib/trainingProof/zipCheck';
import { unzipTrainingZip } from '@/lib/trainingProof/zipArchive';
import { itemDoc, storageRel, TP_IMAGE_ROOT } from '@/lib/trainingProof/storage';
import { oid } from './http';

// קליטת קובץ ZIP מתחנת-האימון (docs/75 ה-12; docs/76 §3–§4, §8.2) — בשני שלבים, כדי
// שאף בקשה לא תעבוד מספיק זמן כדי שהשער של האתר יחזיר 504 (docs/42 §10):
//
//   stage(bytes) — בדיקה מלאה ב-zipCheck (בלי לכתוב דבר אם יש שגיאה); הקובץ נשמר
//                  בתיקיית-המתנה, והחבילה נרשמת (חדשה — מושהית עד סוף הקליטה).
//   step(token)  — מנה של פריטים בכל קריאה (עד CHUNK_ITEMS או CHUNK_MS): תמונות לדיסק
//                  ומסמכים למסד. הדפדפן קורא שוב ושוב עד finished.
//
// העלאה חוזרת של אותה חבילה (package_id + part): פריט שכבר קיים אינו נוצר שוב ואינו
// נדרס — גם לא פריט שכבר הוגה. תמונה שכבר קיימת אינה נכתבת שוב.

export const CHUNK_ITEMS = 300;
export const CHUNK_MS = 8000;
const BATCH = 100;
const STAGING = `${TP_IMAGE_ROOT}/_staging`;
const STALE_MS = 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[0-9a-f]{24}$/;

const stagingDir = (token) => resolveImageFsPath(`${STAGING}/${token}`);
const stagingPath = (token, name) => `${stagingDir(token)}/${name}`;

async function readMeta(token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  return fs.readJson(stagingPath(token, 'meta.json')).catch(() => null);
}

// קבצי-המתנה ישנים (קליטה שננטשה באמצע) נמחקים
async function sweepStaging(now = Date.now()) {
  const dir = resolveImageFsPath(STAGING);
  const names = await fs.readdir(dir).catch(() => []);
  for (const n of names) {
    const p = `${dir}/${n}`;
    const st = await fs.stat(p).catch(() => null);
    if (st && now - st.mtimeMs > STALE_MS) await fs.remove(p).catch(() => {});
  }
}

// מה שנקרא מהקובץ — לתצוגה בכרטיס ובטבלה
function readSummary(chk) {
  const out = { items: chk.counts.items, byTrack: chk.counts.by_track };
  if (chk.books) {
    const pages = new Map();
    for (const it of chk.items) pages.set(it.book, (pages.get(it.book) || 0) + 1);
    out.books = [...chk.books.values()].map((b) => ({ alias: b.alias || b.book, pages: pages.get(b.book) || 0 }));
  }
  return out;
}

// השלב הראשון. expectSection — החלק של הכרטיס שאליו הועלה הקובץ.
// מחזיר {error, errors?} או {token, section, manifest, read, existing, proofed, warnings, total, newPackage}
export async function stage(bytes, { expectSection, userId, fileName = '' }) {
  const sizeErr = checkZipSize(bytes?.length);
  if (sizeErr) return { error: sizeErr };
  let entries;
  try {
    entries = unzipTrainingZip(bytes);
  } catch (e) {
    return { error: e?.message || 'קובץ ה-ZIP פגום' };
  }
  const chk = checkToSiteZip(entries, { expectSection });
  if (!chk.ok) {
    const wrong = chk.manifest == null && entries && checkToSiteZip(entries).section;
    return { error: chk.errors[0] || 'הקובץ לא תקין', errors: chk.errors, wrongSection: wrong && wrong !== expectSection ? wrong : null };
  }
  const m = chk.manifest;
  await sweepStaging();

  const [existing, proofed, pkg] = await Promise.all([
    TrainingProofItem.countDocuments({ packageId: m.package_id, part: m.part }),
    TrainingProofItem.countDocuments({ packageId: m.package_id, part: m.part, status: { $nin: ['available', 'held'] } }),
    TrainingProofPackage.findOne({ packageId: m.package_id, part: m.part }).lean(),
  ]);
  if (pkg && pkg.section !== m.section) return { error: 'מזהה החבילה הזה כבר קיים באתר בחלק אחר' };
  if (!pkg) {
    // חבילה חדשה — מושהית עד שהקליטה מסתיימת, כדי שמתנדב לא יקבל חבילה חלקית
    await TrainingProofPackage.create({
      packageId: m.package_id,
      part: m.part,
      parts: m.parts,
      section: m.section,
      label: m.label || '',
      note: m.note || '',
      stationId: m.station_id,
      counts: { items: m.counts.items, by_track: m.counts.by_track || {}, read: readSummary(chk) },
      open: false,
      createdAt: new Date(m.created_at),
      uploadedBy: userId ? oid(userId) : undefined,
    });
  }

  const token = randomBytes(12).toString('hex');
  const meta = {
    token,
    section: m.section,
    packageId: m.package_id,
    part: m.part,
    total: chk.items.length,
    done: 0,
    inserted: 0,
    newPackage: !pkg,
    userId: userId ? String(userId) : null,
    fileName: String(fileName).slice(0, 200),
  };
  const dir = stagingDir(token);
  try {
    await fs.ensureDir(dir);
    await fs.outputJson(stagingPath(token, 'data.json'), {
      manifest: m,
      items: chk.items,
      books: chk.books ? [...chk.books.values()] : null,
      counts: chk.counts,
      base: chk.base,
    });
    await fs.outputFile(stagingPath(token, 'upload.zip'), bytes);
    await fs.outputJson(stagingPath(token, 'meta.json'), meta);
  } catch (e) {
    await fs.remove(dir).catch(() => {});
    throw e;
  }
  return {
    token,
    section: m.section,
    manifest: { packageId: m.package_id, part: m.part, parts: m.parts, label: m.label || '', note: m.note || '', createdAt: m.created_at },
    read: readSummary(chk),
    existing,
    proofed,
    warnings: chk.warnings,
    total: chk.items.length,
    newPackage: !pkg,
  };
}

async function writeImage(manifest, entries, base, rel, written) {
  const store = storageRel(manifest.package_id, rel);
  if (written.has(store)) return;
  written.add(store);
  const fsPath = resolveImageFsPath(store);
  if (await fs.pathExists(fsPath)) return;
  const bytes = entries[base + rel];
  if (!bytes) throw new Error(`תמונה חסרה בקובץ-ההמתנה: ${rel}`);
  await fs.outputFile(fsPath, bytes);
}

// מנה אחת. מחזיר {error} או {done, total, inserted, skipped, finished}
export async function step(token, { now = Date.now, budgetMs = CHUNK_MS, maxItems = CHUNK_ITEMS } = {}) {
  const meta = await readMeta(token);
  if (!meta) return { error: 'הקליטה הזו לא נמצאה (אולי כבר הסתיימה או בוטלה) — העלו את הקובץ שוב' };
  const data = await fs.readJson(stagingPath(token, 'data.json')).catch(() => null);
  if (!data?.manifest || !Array.isArray(data.items)) return { error: 'קובץ-ההמתנה חסר — העלו את הקובץ שוב' };
  const zipBytes = await fs.readFile(stagingPath(token, 'upload.zip')).catch(() => null);
  if (!zipBytes) return { error: 'קובץ-ההמתנה חסר — העלו את הקובץ שוב' };
  const m = data.manifest;
  const chk = {
    manifest: m,
    items: data.items,
    books: data.books ? new Map(data.books.map((b) => [b.book, b])) : null,
    counts: data.counts,
  };

  if (meta.done === 0 && chk.books) {
    // ספרי-הגלאי: רשומה לכל ספר (הכינוי מהקובץ הראשון שבו הופיע)
    await TrainingProofBook.bulkWrite(
      [...chk.books.values()].map((b) => ({
        updateOne: {
          filter: { book: b.book },
          update: {
            $setOnInsert: { book: b.book, alias: b.alias || '', kind: b.kind || null, streams: b.streams || [] },
            $max: { pagesTotal: Number.isInteger(b.pages_total) ? b.pages_total : 0 },
          },
          upsert: true,
        },
      }))
    );
    // אותו ספר בכמה קבצים: זרמים שעוד אין לספר נוספים (לפי id). לא דורסים זרם קיים —
    // גם לא זרם שמתנדב הוסיף — ולא את מי שמחזיק את הספר
    const known = new Map(
      (await TrainingProofBook.find({ book: { $in: [...chk.books.keys()] } }, { book: 1, streams: 1 }).lean()).map((d) => [
        d.book,
        new Set((d.streams || []).map((s) => s.id)),
      ])
    );
    const adds = [];
    for (const b of chk.books.values()) {
      const have = known.get(b.book) || new Set();
      const missing = (b.streams || []).filter((s) => !have.has(s.id));
      if (missing.length) adds.push({ updateOne: { filter: { book: b.book }, update: { $push: { streams: { $each: missing } } } } });
    }
    if (adds.length) await TrainingProofBook.bulkWrite(adds);
  }

  const start = now();
  const written = new Set();
  const upcoming = chk.items.slice(meta.done, meta.done + maxItems);
  const wanted = new Set();
  for (const it of upcoming) {
    wanted.add(data.base + it.img);
    if (it.ctx?.img) wanted.add(data.base + it.ctx.img);
  }
  const entries = unzipTrainingZip(new Uint8Array(zipBytes), { include: (file) => wanted.has(file.name) });
  let processed = 0;
  while (meta.done < meta.total && processed < maxItems && now() - start < budgetMs) {
    const batch = chk.items.slice(meta.done, meta.done + Math.min(BATCH, maxItems - processed));
    const have = new Set(
      (await TrainingProofItem.find({ packageId: m.package_id, uid: { $in: batch.map((it) => it.uid) } }, { uid: 1 }).lean()).map((d) => d.uid)
    );
    const fresh = batch.filter((it) => !have.has(it.uid));
    for (const it of fresh) {
      await writeImage(m, entries, data.base, it.img, written);
      if (it.ctx?.img) await writeImage(m, entries, data.base, it.ctx.img, written);
    }
    if (fresh.length) {
      try {
        const res = await TrainingProofItem.insertMany(fresh.map((it) => itemDoc(m, it)), { ordered: false });
        meta.inserted += res.length;
      } catch (e) {
        // מרוץ עם העלאה מקבילה של אותו קובץ: הכפילויות נדחות במפתח הייחודי, השאר נכנס
        if (e?.code !== 11000 && !e?.writeErrors) throw e;
        meta.inserted += e.insertedDocs?.length ?? e.result?.insertedCount ?? 0;
      }
    }
    meta.done += batch.length;
    processed += batch.length;
  }

  const finished = meta.done >= meta.total;
  if (finished) {
    const site = await TrainingProofItem.countDocuments({ packageId: m.package_id, part: m.part });
    const set = { 'counts.site': site, 'counts.read': readSummary(chk) };
    if (meta.newPackage) set.open = true;
    await TrainingProofPackage.updateOne({ packageId: m.package_id, part: m.part }, { $set: set });
    await cancel(token);
  } else {
    await fs.outputJson(stagingPath(token, 'meta.json'), meta);
  }
  return { done: meta.done, total: meta.total, inserted: meta.inserted, skipped: meta.done - meta.inserted, finished };
}

// ביטול קליטה באמצע: קובצי-ההמתנה נמחקים. מה שכבר נקלט נשאר (והחבילה החדשה — מושהית)
export async function cancel(token) {
  if (!TOKEN_RE.test(String(token || ''))) return false;
  await fs.remove(stagingDir(token)).catch(() => {});
  return true;
}
