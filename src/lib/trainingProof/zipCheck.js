// בדיקת קובץ ZIP מתחנת-האימון (חוזה tp/1, docs/76 §2–§4) — טהורה: מקבלת את מפת
// הקבצים של fflate ({נתיב: Uint8Array}) ומחזירה את התוכן המאומת, בלי שום כתיבה.
// מסך ההעלאה בניהול (סשן ד') קורא לה לפני שהוא כותב משהו למסד או לדיסק.
//
// שמות הקבצים בתוך ה-ZIP הם ASCII בלבד (manifest.json, items.jsonl, img/…) — בדיוק
// כדי לא ליפול בשיבוש השמות העבריים של כלי-דחיסה ב-Windows (packageParse.js).
// כלי-דחיסה שעוטף הכול בתיקייה אחת — נתמך: כל הנתיבים יחסיים לתיקייה של manifest.json.

import {
  CONTRACT,
  DIR_TO_SITE,
  SECTIONS,
  SECTION_LABELS,
  LINE_SCRIPTS,
  WORD_SCRIPTS,
  OCR_SOURCES,
  FRAME_KINDS,
  FRAME_ROLES,
  OBJECT_KINDS,
  FRAME_SRC,
  PAGE_TYPES,
  FRAMES_PAGE_STATUS_IN,
  MAX_ITEMS_PER_FILE,
  MAX_FILE_BYTES,
  MAX_FRAMES_PAGES,
  SIG_RE,
  BOOK_RE,
  PACKAGE_ID_RE,
  STATION_ID_RE,
  IMAGE_EXT_RE,
  uidFitsSection,
  safeZipPath,
  validBox,
} from './vocab.js';

// לא מציפים את המנהל: אחרי כמה שגיאות מפסיקים למנות ומסכמים
export const MAX_ERRORS = 25;
const PTYPE_RE = /^[a-z][a-z0-9_-]{0,23}$/;
const MAX_LABEL = 200;
const MAX_TEXT = 4000;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const posInt = (v) => Number.isInteger(v) && v > 0;
const isStr = (v) => typeof v === 'string';
const optStr = (v, max = MAX_TEXT) => v === undefined || v === null || (isStr(v) && v.length <= max);

function decode(bytes, decoder) {
  return decoder.decode(bytes).replace(/^﻿/, '');
}

function parseJson(bytes, decoder) {
  try {
    return JSON.parse(decode(bytes, decoder));
  } catch {
    return undefined;
  }
}

// גודל הקובץ לפני פתיחה (§2): עד 40MB
export function checkZipSize(byteLength) {
  if (!Number.isFinite(byteLength) || byteLength <= 0) return 'הקובץ ריק';
  if (byteLength > MAX_FILE_BYTES) return `הקובץ גדול מ-${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB — התחנה מפצלת לכמה קבצים`;
  return null;
}

// מוצא את manifest.json: בשורש, או בתוך תיקייה אחת שעוטפת הכול
function findBase(entries) {
  if (entries['manifest.json']) return '';
  const hits = Object.keys(entries).filter((p) => /^[^/]+\/manifest\.json$/.test(p));
  return hits.length === 1 ? hits[0].slice(0, -'manifest.json'.length) : null;
}

// בדיקת manifest.json (§3). expectSection — החלק שבכרטיס שאליו הועלה הקובץ (ה-12)
export function checkManifest(m, expectSection = null) {
  if (!isObj(m)) return 'manifest.json אינו JSON תקין';
  if (m.contract !== CONTRACT) return `גרסת-חוזה לא נתמכת: ${m.contract ?? 'חסרה'} (האתר מכיר את ${CONTRACT})`;
  if (m.direction !== DIR_TO_SITE)
    return m.direction === 'to-station'
      ? 'זה קובץ-החזרה לתחנה, לא קובץ להעלאה לאתר'
      : `כיוון לא מוכר: ${m.direction ?? 'חסר'}`;
  if (!SECTIONS.includes(m.section)) return `חלק לא מוכר: ${m.section ?? 'חסר'}`;
  if (expectSection && m.section !== expectSection)
    return `הקובץ הזה שייך ל"${SECTION_LABELS[m.section]}" ולא ל"${SECTION_LABELS[expectSection]}" — העלו אותו בכרטיס הנכון`;
  if (!PACKAGE_ID_RE.test(String(m.package_id || ''))) return 'מזהה החבילה (package_id) חסר או לא תקין';
  if (!posInt(m.part) || !posInt(m.parts) || m.part > m.parts) return 'מספר החלק (part/parts) לא תקין';
  if (!STATION_ID_RE.test(String(m.station_id || ''))) return 'מזהה התחנה (station_id) חסר או לא תקין';
  if (!isStr(m.created_at) || Number.isNaN(Date.parse(m.created_at))) return 'מועד הייצוא (created_at) חסר או לא תקין';
  if (!optStr(m.label, MAX_LABEL)) return 'השם (label) ארוך מדי';
  if (!optStr(m.note, MAX_TEXT)) return 'ההערה (note) ארוכה מדי';
  if (!isObj(m.counts) || !isInt(m.counts.items) || m.counts.items < 0) return 'מספר הפריטים (counts.items) חסר';
  if (m.counts.by_track !== undefined && !isObj(m.counts.by_track)) return 'counts.by_track לא תקין';
  return null;
}

// שדות משותפים לכל פריט: uid, sig, img, w, h, book/alias
function checkCommon(it, section, entries, base) {
  if (!uidFitsSection(it.uid, section)) return `מזהה (uid) לא תקין לחלק "${SECTION_LABELS[section]}": ${String(it.uid ?? '').slice(0, 60)}`;
  if (!SIG_RE.test(String(it.sig || ''))) return 'חתימה (sig) חסרה או לא תקינה';
  if (!safeZipPath(it.img) || !IMAGE_EXT_RE.test(it.img)) return `נתיב-תמונה לא תקין: ${String(it.img ?? '').slice(0, 80)}`;
  if (!entries[base + it.img]) return `התמונה חסרה בקובץ: ${it.img}`;
  if (!posInt(it.w) || !posInt(it.h) || it.w > 30000 || it.h > 30000) return 'מידות התמונה (w/h) לא תקינות';
  if (it.book !== undefined && it.book !== null && !BOOK_RE.test(String(it.book))) return `מפתח-ספר (book) לא תקין: ${it.book}`;
  if (!optStr(it.alias, 60)) return 'הכינוי (alias) לא תקין';
  if (it.page !== undefined && it.page !== null && !(isInt(it.page) && it.page >= 0)) return 'מספר עמוד לא תקין';
  return null;
}

// העמוד המלא לשורה ("הצג בעמוד המלא"): ocr (§4.1) ו-router (§4.2), אותה צורה
function checkCtx(it, entries, base) {
  if (it.ctx === undefined || it.ctx === null) return null;
  if (!isObj(it.ctx)) return 'ctx לא תקין';
  if (!safeZipPath(it.ctx.img) || !IMAGE_EXT_RE.test(it.ctx.img)) return 'נתיב תמונת-ההקשר לא תקין';
  if (!entries[base + it.ctx.img]) return `תמונת-ההקשר חסרה בקובץ: ${it.ctx.img}`;
  if (!validBox(it.ctx.bbox)) return 'תיבת השורה בעמוד (ctx.bbox) לא תקינה';
  return null;
}

function checkOcr(it, entries, base) {
  if (!LINE_SCRIPTS.includes(it.track)) return `כתב (track) לא מוכר: ${it.track ?? 'חסר'}`;
  if (!OCR_SOURCES.includes(it.source)) return `מקור (source) לא מוכר: ${it.source ?? 'חסר'}`;
  if (!isStr(it.text) || it.text.length > MAX_TEXT) return 'הטקסט (text) חסר';
  if (it.conf !== undefined && it.conf !== null && !(typeof it.conf === 'number' && it.conf >= 0 && it.conf <= 100))
    return 'ביטחון (conf) מחוץ לטווח 0–100';
  if (it.line_no !== undefined && it.line_no !== null && !isInt(it.line_no)) return 'מספר שורה (line_no) לא תקין';
  return checkCtx(it, entries, base);
}

// שורת-נתב שאחת מתיבות-המילים שלה לא תקינה (למשל מילה בלי רוחב, x0 == x1). זו לא סיבה לדחות
// קובץ שלם: השורה נקלטת בלי words, ומי שמסמן "מעורבת" מקבל חלוקה לפי הדיו — בדיוק כמו
// שורה שהגיעה בלי מילים (§4.2). התוצאה חוזרת עם words_src: "site". רק התיבה — מספר-סדר
// כפול או כתב-מילה לא מוכר הם עדיין שגיאה בקובץ.
export function badWordBoxes(it) {
  return Array.isArray(it.words) && it.words.some((w) => isObj(w) && !validBox(w.box, it.w, it.h));
}

function withoutWords(it) {
  const { words: _drop, ...rest } = it;
  return rest;
}

// "6 שורות: תיבות-המילים לא תקינות — יחולקו לפי הדיו (שורות 225, 474, …)"
export function wordBoxWarning(lineNos) {
  const n = lineNos.length;
  const shown = lineNos.slice(0, 10).join(', ') + (n > 10 ? ', …' : '');
  return `${n === 1 ? 'שורה אחת' : `${n} שורות`}: תיבות-המילים לא תקינות — יחולקו לפי הדיו (${n === 1 ? 'שורה' : 'שורות'} ${shown} בקובץ)`;
}

function checkRouter(it, entries, base) {
  if (it.pred !== undefined && it.pred !== null && !LINE_SCRIPTS.includes(it.pred)) return `הצעת-כתב (pred) לא מוכרת: ${it.pred}`;
  if (it.pred_p !== undefined && it.pred_p !== null && !(typeof it.pred_p === 'number' && it.pred_p >= 0 && it.pred_p <= 1))
    return 'pred_p מחוץ לטווח 0–1';
  if (!optStr(it.text)) return 'הטקסט (text) לא תקין';
  if (it.words !== undefined && it.words !== null) {
    if (!Array.isArray(it.words) || it.words.length > 400) return 'רשימת המילים (words) לא תקינה';
    const ks = new Set();
    for (const w of it.words) {
      if (!isObj(w) || !isInt(w.k) || w.k < 0 || ks.has(w.k)) return 'מילה בלי מספר-סדר (k) ייחודי';
      ks.add(w.k);
      if (!validBox(w.box, it.w, it.h)) return `תיבת המילה ${w.k} לא תקינה או מחוץ לתמונה`;
      if (w.pred !== undefined && w.pred !== null && !WORD_SCRIPTS.includes(w.pred)) return `הצעת-כתב למילה ${w.k} לא מוכרת: ${w.pred}`;
      if (!optStr(w.text, 200)) return `הטקסט של המילה ${w.k} לא תקין`;
    }
  }
  return checkCtx(it, entries, base);
}

// עמוד-גלאי שאחת המסגרות שלו גולשת מעבר לקצה התמונה (הצעת-הגלאי בתחנה, כמה פיקסלים —
// קובץ 2026-11-01). זו לא סיבה לדחות קובץ שלם: המסגרת מקוצרת לגבולות התמונה, והקובץ מקבל
// אזהרה. רק תיבה תקינה בעצמה (x1 > x0, y1 > y0) שנשארת תקינה אחרי הקיצור — תיבה פגומה, או
// מסגרת שכולה מחוץ לתמונה, הן עדיין שגיאה בקובץ. מחזיר כמה מסגרות קוצרו (ומשנה את it במקומו).
export function trimFrameBoxes(it) {
  if (!Array.isArray(it.frames) || !(it.w > 0) || !(it.h > 0)) return 0;
  let n = 0;
  for (const f of it.frames) {
    if (!isObj(f) || validBox(f.box, it.w, it.h)) continue;
    if (!Array.isArray(f.box) || f.box.length !== 4 || !f.box.every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    const [x0, y0, x1, y1] = f.box;
    if (x1 <= x0 || y1 <= y0) continue;
    const box = [Math.max(0, x0), Math.max(0, y0), Math.min(it.w, x1), Math.min(it.h, y1)];
    if (!validBox(box, it.w, it.h)) continue;
    f.box = box;
    n++;
  }
  return n;
}

// "3 עמודים: מסגרות שגלשו מעבר לקצה התמונה — קוצרו לגבולות העמוד (שורות 2, 4, 5 בקובץ)"
export function frameBoxWarning(lineNos) {
  const n = lineNos.length;
  const shown = lineNos.slice(0, 10).join(', ') + (n > 10 ? ', …' : '');
  return `${n === 1 ? 'עמוד אחד' : `${n} עמודים`}: מסגרות שגלשו מעבר לקצה התמונה — קוצרו לגבולות העמוד (${n === 1 ? 'שורה' : 'שורות'} ${shown} בקובץ)`;
}

function checkFrames(it, books) {
  if (!BOOK_RE.test(String(it.book || ''))) return 'מפתח-ספר (book) חסר';
  const book = books.get(it.book);
  if (!book) return `הספר ${it.book} לא מופיע ב-books.json`;
  if (!(isInt(it.page) && it.page >= 0)) return 'מספר עמוד חסר';
  // ptype — צורת-העמוד בתחנה (scan, cols, around…); רק לתצוגה ולסינון, ולכן כל מילה קצרה
  if (it.ptype !== undefined && it.ptype !== null && !PTYPE_RE.test(String(it.ptype))) return `סוג-עמוד (ptype) לא תקין: ${it.ptype}`;
  if (it.status !== undefined && it.status !== null && !FRAMES_PAGE_STATUS_IN.includes(it.status)) return `מצב (status) לא מוכר: ${it.status}`;
  if (it.scale !== undefined && it.scale !== null && !(typeof it.scale === 'number' && it.scale > 0 && it.scale <= 10)) return 'scale לא תקין';
  if (!Array.isArray(it.frames) || it.frames.length > 500) return 'רשימת המסגרות (frames) חסרה';
  const streamIds = new Set((book.streams || []).map((s) => s.id));
  const fids = new Set();
  for (const f of it.frames) {
    if (!isObj(f) || !isStr(f.fid) || !f.fid || f.fid.length > 40 || fids.has(f.fid)) return 'מסגרת בלי מזהה (fid) ייחודי';
    fids.add(f.fid);
    if (!FRAME_KINDS.includes(f.kind)) return `סוג-מסגרת (kind) לא מוכר: ${f.kind}`;
    if (!FRAME_ROLES.includes(f.role)) return `תפקיד (role) לא מוכר: ${f.role}`;
    if (f.kind === 'object' && !OBJECT_KINDS.includes(f.obj)) return `סוג-אובייקט (obj) לא מוכר: ${f.obj}`;
    if (!validBox(f.box, it.w, it.h)) return `תיבת המסגרת ${f.fid} לא תקינה או מחוץ לתמונה`;
    if (f.stream !== null && f.stream !== undefined && !streamIds.has(f.stream)) return `זרם לא מוכר במסגרת ${f.fid}: ${f.stream}`;
    if (f.ord !== null && f.ord !== undefined && !posInt(f.ord)) return `סדר-קריאה (ord) לא תקין במסגרת ${f.fid}`;
    if (f.cont !== undefined && typeof f.cont !== 'boolean') return `cont לא תקין במסגרת ${f.fid}`;
    if (f.src !== undefined && !FRAME_SRC.includes(f.src)) return `src לא מוכר במסגרת ${f.fid}`;
  }
  return null;
}

// books.json של frames (§4.3) → Map(book → רשומה), או מחרוזת-שגיאה
export function checkBooks(list) {
  if (!Array.isArray(list) || !list.length) return 'books.json חסר או ריק';
  const out = new Map();
  for (const b of list) {
    if (!isObj(b) || !BOOK_RE.test(String(b.book || ''))) return 'ספר ב-books.json בלי מפתח (book) תקין';
    if (out.has(b.book)) return `ספר כפול ב-books.json: ${b.book}`;
    if (!optStr(b.alias, 60)) return `כינוי לא תקין לספר ${b.book}`;
    if (b.kind !== undefined && b.kind !== null && !PAGE_TYPES.includes(b.kind)) return `סוג (kind) לא מוכר לספר ${b.book}`;
    if (b.pages_total !== undefined && !(isInt(b.pages_total) && b.pages_total >= 0)) return `pages_total לא תקין לספר ${b.book}`;
    const streams = b.streams ?? [];
    if (!Array.isArray(streams)) return `רשימת הזרמים לא תקינה לספר ${b.book}`;
    const ids = new Set();
    for (const s of streams) {
      if (!isObj(s) || !isStr(s.id) || !s.id || ids.has(s.id)) return `זרם בלי מזהה ייחודי בספר ${b.book}`;
      ids.add(s.id);
      if (!optStr(s.name, 80)) return `שם-זרם לא תקין בספר ${b.book}`;
      if (s.role !== undefined && s.role !== null && !FRAME_ROLES.includes(s.role)) return `תפקיד-זרם לא מוכר בספר ${b.book}: ${s.role}`;
    }
    out.set(b.book, { ...b, streams });
  }
  return out;
}

// המונה של כל "מסלול" — כדי להשוות ל-counts.by_track (רק לתצוגה; אי-התאמה = אזהרה)
export function trackOf(section, it) {
  if (section === 'ocr') return it.track;
  if (section === 'router') return it.pred || 'none';
  return it.ptype || 'scan';
}

// הבדיקה המלאה. entries — מפת fflate. מחזיר:
//   {ok, errors[], warnings[], base, manifest, section, items[], books(Map|null), images:Set, wordBoxLines[], frameBoxLines[]}
// items[] = הפריטים כפי שהגיעו (payload) — חוץ משורת-נתב עם תיבת-מילה פגומה, שנקלטת בלי words
// (wordBoxLines = מספרי-השורות שלהן ב-items.jsonl, ואזהרה אחת עליהן), ועמוד-גלאי שמסגרת שלו גלשה
// מעבר לתמונה, שנקלט עם המסגרת מקוצרת (frameBoxLines, ואזהרה אחת). images = כל נתיבי
// התמונות שבשימוש (יחסיים ל-base), כולל תמונות-הקשר — הכותב מעתיק רק אותן.
export function checkToSiteZip(entries, { expectSection = null, decoder = new TextDecoder('utf-8') } = {}) {
  const errors = [];
  const warnings = [];
  const out = { ok: false, errors, warnings, base: '', manifest: null, section: null, items: [], books: null, images: new Set() };
  const base = findBase(entries || {});
  if (base === null) {
    errors.push('אין manifest.json בקובץ — זה לא קובץ של תחנת-האימון');
    return out;
  }
  out.base = base;
  for (const p of Object.keys(entries)) {
    // שמות עבריים = כלי-דחיסה ששיבש, או קובץ שלא מהתחנה
    if (/[^\x20-\x7e]/.test(p)) {
      errors.push('יש בקובץ שמות-קבצים שאינם ASCII — הקובץ לא נוצר בתחנה');
      return out;
    }
  }
  const manifest = parseJson(entries[base + 'manifest.json'], decoder);
  const mErr = checkManifest(manifest, expectSection);
  if (mErr) {
    errors.push(mErr);
    return out;
  }
  out.manifest = manifest;
  const section = manifest.section;
  out.section = section;

  let books = null;
  if (section === 'frames') {
    const raw = entries[base + 'books.json'];
    const b = raw ? checkBooks(parseJson(raw, decoder)) : 'books.json חסר';
    if (typeof b === 'string') {
      errors.push(b);
      return out;
    }
    books = b;
    out.books = books;
  }

  const raw = entries[base + 'items.jsonl'];
  if (!raw) {
    errors.push('items.jsonl חסר');
    return out;
  }
  const lines = decode(raw, decoder).split(/\r?\n/);
  const seen = new Set();
  const byTrack = {};
  const wordBoxLines = [];
  const frameBoxLines = [];
  let extraErrors = 0;
  const fail = (msg) => {
    if (errors.length < MAX_ERRORS) errors.push(msg);
    else extraErrors++;
  };
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    let it;
    try {
      it = JSON.parse(line);
    } catch {
      fail(`שורה ${i + 1} ב-items.jsonl אינה JSON תקין`);
      return;
    }
    if (!isObj(it)) {
      fail(`שורה ${i + 1} ב-items.jsonl אינה פריט`);
      return;
    }
    let err = checkCommon(it, section, entries, base);
    const dropWords = !err && section === 'router' && badWordBoxes(it);
    if (dropWords) it = withoutWords(it);
    const trimmed = !err && section === 'frames' ? trimFrameBoxes(it) : 0;
    err =
      err ||
      (section === 'ocr' ? checkOcr(it, entries, base) : section === 'router' ? checkRouter(it, entries, base) : checkFrames(it, books));
    if (err) {
      fail(`שורה ${i + 1}: ${err}`);
      return;
    }
    if (seen.has(it.uid)) {
      fail(`שורה ${i + 1}: הפריט ${it.uid} מופיע פעמיים`);
      return;
    }
    seen.add(it.uid);
    if (dropWords) wordBoxLines.push(i + 1);
    if (trimmed) frameBoxLines.push(i + 1);
    out.items.push(it);
    out.images.add(it.img);
    if (it.ctx?.img) out.images.add(it.ctx.img);
    const t = trackOf(section, it);
    byTrack[t] = (byTrack[t] || 0) + 1;
  });
  if (extraErrors) errors.push(`ועוד ${extraErrors} שגיאות`);
  if (wordBoxLines.length) warnings.push(wordBoxWarning(wordBoxLines));
  if (frameBoxLines.length) warnings.push(frameBoxWarning(frameBoxLines));
  out.wordBoxLines = wordBoxLines;
  out.frameBoxLines = frameBoxLines;

  const limit = section === 'frames' ? MAX_FRAMES_PAGES : MAX_ITEMS_PER_FILE;
  if (out.items.length > limit)
    errors.push(`בקובץ ${out.items.length} ${section === 'frames' ? 'עמודים' : 'פריטים'} — המקסימום הוא ${limit}`);
  if (!errors.length && !out.items.length) errors.push('אין פריטים בקובץ');
  if (!errors.length && manifest.counts.items !== out.items.length)
    errors.push(`ב-manifest כתוב ${manifest.counts.items} פריטים, ובקובץ יש ${out.items.length} — ייתכן שהקובץ לא שלם`);
  if (manifest.counts.by_track) {
    for (const [k, v] of Object.entries(manifest.counts.by_track)) {
      if ((byTrack[k] || 0) !== v) warnings.push(`במסלול "${k}": ב-manifest ${v}, בקובץ ${byTrack[k] || 0}`);
    }
  }
  out.counts = { items: out.items.length, by_track: byTrack };
  out.ok = errors.length === 0;
  return out;
}
