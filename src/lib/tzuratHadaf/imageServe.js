// צורת הדף — הגשת התמונות (sharp): חיתוך סביב תיבת פריט (נשמר בדיסק — הפריט נשאל פעמים רבות, ופענוח סריקה
// מלאה יקר), הסריקה המלאה, ותמונת עמוד (סריקה/שלנו) עם חיתוך בשברים או ממוזערת. ייבוא יחסי (node:test).

import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { cropRect, fracCrop, THUMB_W } from './imageCrop.js';
import { imageFsPath, cropsDir, writeIntoPlace } from './storage.js';
import { fnv1a } from './common.js';

const MIME = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const CROP_CACHE_MAX_FILES = 5000;
const CROP_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const CROP_PRUNE_INTERVAL_MS = 10000;
let lastCropPrune = 0;
let cropPrunePromise = null;
const mimeOf = (p) => MIME[path.extname(p).slice(1).toLowerCase()] || 'application/octet-stream';

async function readOrNull(p) {
  try {
    return await fs.readFile(/*turbopackIgnore: true*/ p);
  } catch (e) {
    if (e?.code === 'ENOENT') return null;
    throw e;
  }
}

async function cropFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true }).catch((e) => {
    if (e?.code === 'ENOENT') return [];
    throw e;
  })) {
    const p = path.join(/*turbopackIgnore: true*/ dir, entry.name);
    if (entry.isDirectory()) out.push(...await cropFiles(p));
    else if (entry.isFile()) {
      const stat = await fs.stat(/*turbopackIgnore: true*/ p);
      out.push({ p, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return out;
}

async function pruneCropCache() {
  const files = (await cropFiles(cropsDir())).sort((a, b) => a.mtimeMs - b.mtimeMs);
  let bytes = files.reduce((sum, file) => sum + file.size, 0);
  let count = files.length;
  for (const file of files) {
    if (count <= CROP_CACHE_MAX_FILES && bytes <= CROP_CACHE_MAX_BYTES) break;
    await fs.rm(/*turbopackIgnore: true*/ file.p, { force: true });
    count--;
    bytes -= file.size;
  }
}

function scheduleCropPrune() {
  const now = Date.now();
  if (cropPrunePromise || now - lastCropPrune < CROP_PRUNE_INTERVAL_MS) return;
  lastCropPrune = now;
  cropPrunePromise = pruneCropCache()
    .catch((e) => console.error('tzurat crop prune', e?.code || e?.name))
    .finally(() => { cropPrunePromise = null; });
}

/** הקובץ המקורי כמו שהוא ← {buffer, type} או null */
export async function originalImage(rel) {
  if (!rel) return null;
  const p = imageFsPath(rel);
  const buffer = await readOrNull(p);
  return buffer ? { buffer, type: mimeOf(p) } : null;
}

/** חיתוך הפריט (WebP) ← {buffer, type} או null. ctx — הקשר רחב. נשמר ב-storage/tzurat-hadaf/crops. */
export async function itemCrop(item, page, { ctx = false } = {}) {
  const rel = page?.scan?.path;
  if (!rel || !item?.box) return null;
  const W = page.scan.w;
  const H = page.scan.h;
  const rect = cropRect(item.box, W, H, { ctx });
  if (!rect) return null;
  const key = fnv1a(`${rel}|${page.buildId || ''}|${page.round || 1}|${rect.left},${rect.top},${rect.width},${rect.height}`).toString(36);
  const cached = path.join(/*turbopackIgnore: true*/ cropsDir(), String(item.slug || 'x').replace(/[^a-z0-9-]/g, ''), `${String(item._id)}-${key}.webp`);
  const hit = await readOrNull(cached);
  if (hit) return { buffer: hit, type: 'image/webp' };
  const src = await readOrNull(imageFsPath(rel));
  if (!src) return null;
  const img = sharp(src);
  const meta = await img.metadata();
  // המידות בחבילה הן של הסריקה; אם הקובץ שונה (הוקטן) — החיתוך לפי היחס
  const sx = meta.width && W ? meta.width / W : 1;
  const sy = meta.height && H ? meta.height / H : 1;
  const left = Math.min(Math.max(0, Math.round(rect.left * sx)), Math.max(0, (meta.width || 1) - 1));
  const top = Math.min(Math.max(0, Math.round(rect.top * sy)), Math.max(0, (meta.height || 1) - 1));
  const region = {
    left,
    top,
    width: Math.max(1, Math.min(Math.round(rect.width * sx), (meta.width || 1) - left)),
    height: Math.max(1, Math.min(Math.round(rect.height * sy), (meta.height || 1) - top)),
  };
  const buffer = await img.extract(region).webp({ quality: 85 }).toBuffer();
  await writeIntoPlace(cached, buffer).catch((e) => console.error('tzurat crop cache', e?.code || e?.name));
  scheduleCropPrune();
  return { buffer, type: 'image/webp' };
}

/** תמונת עמוד: side scan|ours, חיתוך בשברים (x,y,w,h) ו/או thumb ← {buffer, type} | {error} | null */
export async function pageImage(page, side, params) {
  const ref = side === 'ours' ? page?.ours : page?.scan;
  if (!ref?.path) return null;
  const get = (k) => (typeof params?.get === 'function' ? params.get(k) : params?.[k]);
  const thumb = get('thumb') === '1';
  const crop = fracCrop(params, ref.w, ref.h);
  if (crop?.error) return { error: crop.error };
  if (!crop && !thumb) return originalImage(ref.path);
  // חיתוך/ממוזערת — נשמרים בדיסק לפי העמוד, הגרסה, הצד והחיתוך (המיושר לרשת — fracCrop)
  const key = fnv1a(`${ref.path}|${page.buildId || ''}|${page.round || 1}|${side}|${crop ? `${crop.left},${crop.top},${crop.width},${crop.height}` : 'full'}|${thumb ? 't' : ''}`).toString(36);
  const cached = path.join(/*turbopackIgnore: true*/ cropsDir(), 'pages', String(page._id || 'x'), `${side}-${key}.webp`);
  const hit = await readOrNull(cached);
  if (hit) return { buffer: hit, type: 'image/webp' };
  const src = await readOrNull(imageFsPath(ref.path));
  if (!src) return null;
  let img = sharp(src);
  if (crop) {
    const meta = await img.metadata();
    const sx = meta.width && ref.w ? meta.width / ref.w : 1;
    const sy = meta.height && ref.h ? meta.height / ref.h : 1;
    const left = Math.min(Math.round(crop.left * sx), (meta.width || 1) - 1);
    const top = Math.min(Math.round(crop.top * sy), (meta.height || 1) - 1);
    img = img.extract({
      left,
      top,
      width: Math.max(1, Math.min(Math.round(crop.width * sx), (meta.width || 1) - left)),
      height: Math.max(1, Math.min(Math.round(crop.height * sy), (meta.height || 1) - top)),
    });
  }
  if (thumb) img = img.resize({ width: THUMB_W, withoutEnlargement: true });
  const buffer = await img.webp({ quality: thumb ? 70 : 85 }).toBuffer();
  await writeIntoPlace(cached, buffer).catch((e) => console.error('tzurat page crop cache', e?.code || e?.name));
  scheduleCropPrune();
  return { buffer, type: 'image/webp' };
}
