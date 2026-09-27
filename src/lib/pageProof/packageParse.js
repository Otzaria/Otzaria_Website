// פענוח ZIP של חבילות-עמודים (חוזה-העמוד §1) — טהור: מקבל את מפת הקבצים
// של fflate ({נתיב: Uint8Array}) ומחזיר חבילות מאומתות, בלי כתיבה.
//
// זיהוי לפי תוכן ולא לפי שם-קובץ: "חבילה.json"/"עמוד-001.json" הם שמות
// עבריים, וכלי-דחיסה ב-Windows שומרים אותם לעיתים בקידוד-OEM בלי דגל UTF-8
// — ואז השם שמגיע ל-fflate משובש. קובץ-חבילה = JSON עם gid ו-pages[] ובלי
// lines; קובץ-עמוד = JSON עם page ו-lines[]. התמונה נמצאת לפי הנתיב היחסי
// שבחבילה (pages/p001.png — ASCII) מול התיקייה של קובץ-החבילה, ששיבושה (אם
// יש) זהה בכל הרשומות.

import { CONTRACT_VERSION } from './vocab.js';

const GID_RE = /^[A-Za-z0-9]{8,64}$/;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|tiff?)$/i;
export const MAX_PAGES_PER_PACKAGE = 2000;

const dirOf = (p) => {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i + 1);
};

// נרמול נתיב יחסי מתוך החבילה: לוכסנים קדימה, בלי ./ ובלי יציאה מהתיקייה
function joinRel(dir, rel) {
  const clean = String(rel || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!clean || clean.startsWith('/') || clean.split('/').includes('..')) return null;
  return dir + clean;
}

function parseJson(bytes, decoder) {
  try {
    const text = decoder.decode(bytes).replace(/^﻿/, '');
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// בדיקת מבנה של עמוד בודד. מחזיר הודעת שגיאה או null.
export function checkPageDoc(doc, gid) {
  if (!doc || typeof doc !== 'object') return 'קובץ-עמוד לא תקין';
  if (doc.contract !== CONTRACT_VERSION) return `גרסת-חוזה לא נתמכת: ${doc.contract}`;
  if (doc.gid !== gid) return 'gid של העמוד שונה מזה של החבילה';
  if (!Number.isInteger(doc.page) || doc.page < 0) return 'מספר-עמוד חסר';
  if (!Array.isArray(doc.size) || doc.size.length !== 2 || !doc.size.every((n) => Number.isInteger(n) && n > 0 && n <= 30000))
    return 'גודל-תמונה (size) לא תקין';
  if (!Array.isArray(doc.lines)) return 'רשימת שורות חסרה';
  const seen = new Set();
  for (const l of doc.lines) {
    if (!l || !Number.isInteger(l.id)) return 'שורה בלי מזהה';
    if (seen.has(l.id)) return `מזהה-שורה כפול: ${l.id}`;
    seen.add(l.id);
    if (!Array.isArray(l.bbox) || l.bbox.length !== 4) return `לשורה ${l.id} אין תיבה`;
  }
  return null;
}

// entries: {path: Uint8Array}. מחזיר {packages:[{meta, pages:[{doc, imagePath}]}], errors:[]}
// imagePath = המפתח במפת הקבצים (כדי שהקורא ישלוף את הבתים).
export function parsePackageEntries(entries, decoder = new TextDecoder('utf-8')) {
  const errors = [];
  const paths = Object.keys(entries).filter((p) => !p.endsWith('/'));
  const jsons = paths
    .filter((p) => /\.json$/i.test(p))
    .map((p) => ({ path: p, data: parseJson(entries[p], decoder) }))
    .filter((j) => j.data && typeof j.data === 'object');

  const metas = jsons.filter((j) => GID_RE.test(j.data.gid || '') && Array.isArray(j.data.pages) && !Array.isArray(j.data.lines));
  if (!metas.length) {
    return { packages: [], errors: ['לא נמצא קובץ-חבילה (חבילה.json עם gid ו-pages) בתוך ה-ZIP'] };
  }

  const packages = [];
  for (const m of metas) {
    const meta = m.data;
    const dir = dirOf(m.path);
    const label = meta.title || meta.gid;
    if (meta.contract !== CONTRACT_VERSION) {
      errors.push(`${label}: גרסת-חוזה לא נתמכת (${meta.contract})`);
      continue;
    }
    if (meta.pages.length > MAX_PAGES_PER_PACKAGE) {
      errors.push(`${label}: יותר מדי עמודים (${meta.pages.length})`);
      continue;
    }
    // קבצי-עמוד באותה תיקייה, לפי מספר-העמוד שבתוכם
    const pageDocs = new Map();
    for (const j of jsons) {
      if (dirOf(j.path) !== dir || !Array.isArray(j.data.lines)) continue;
      if (Number.isInteger(j.data.page)) pageDocs.set(j.data.page, j.data);
    }
    const pages = [];
    for (const entry of meta.pages) {
      const doc = pageDocs.get(entry?.page);
      if (!doc) {
        errors.push(`${label}: חסר קובץ לעמוד ${entry?.page}`);
        continue;
      }
      const err = checkPageDoc(doc, meta.gid);
      if (err) {
        errors.push(`${label} עמוד ${doc.page}: ${err}`);
        continue;
      }
      const imagePath = joinRel(dir, doc.image || entry.image);
      if (!imagePath || !IMAGE_EXT_RE.test(imagePath) || !entries[imagePath]) {
        errors.push(`${label} עמוד ${doc.page}: תמונת-העמוד חסרה ב-ZIP`);
        continue;
      }
      pages.push({ doc, imagePath });
    }
    if (!pages.length) {
      errors.push(`${label}: אין עמודים תקינים`);
      continue;
    }
    pages.sort((a, b) => a.doc.page - b.doc.page);
    packages.push({
      meta: {
        gid: meta.gid,
        title: String(meta.title || meta.gid).slice(0, 200),
        script: typeof meta.script === 'string' ? meta.script : null,
      },
      pages,
    });
  }
  return { packages, errors };
}

// צורת העמוד לשמירה/לשליחה: בלי polygon/baseline (כבדים, והעורך מצייר
// תיבות) — אבל רק בעותק הנשלח למתייג; במסד נשמר העמוד כפי שהגיע.
export function slimPageDoc(doc) {
  return {
    ...doc,
    lines: (doc.lines || []).map((l) => {
      const { polygon, baseline, ...rest } = l;
      return rest;
    }),
  };
}
