// ולידציה ונרמול של תיבות המילים השמורות לעמוד (PageLayout, תוכנית §5.1 מקורות 3–5) — לוגיקה
// טהורה, imports יחסיים בלבד (נבדק ב-node:test). משמש את PUT /api/page-layout (מה שנכנס ל-DB)
// ואת useLocalWordBoxes (המרה מהמבנה האחיד של trackingSource ובחזרה).
//
// המבנה השמור (פיקסלים טבעיים של תמונת העמוד כפי שהדפדפן מציג אותה — אחרי EXIF):
//   { source: 'local-tesseract'|'profile'|'manual', size: [w, h],
//     lines: [{ bbox: [x0,y0,x1,y1], stream?, words: [{ bbox, text?, conf? }] }] }

export const PAGE_LAYOUT_SOURCES = Object.freeze(['local-tesseract', 'profile', 'manual']);

export const PAGE_LAYOUT_LIMITS = Object.freeze({
  maxBodyBytes: 1024 * 1024, // גוף הבקשה (JSON) — 1MB
  maxSide: 20000, // צלע תמונה מרבית בפיקסלים
  maxLines: 600,
  maxWordsPerLine: 300,
  maxWords: 8000,
  maxTextLength: 64, // תווים לטקסט מילה
  boundsTolerance: 2, // חריגה קטנה מגבולות התמונה (עיגול) — נחתכת; מעבר לזה → שגיאה
});

const STREAM_RE = /^[A-Za-z0-9_-]{1,32}$/;
const round2 = (v) => Math.round(v * 100) / 100;

// מקור שמור → שם המקור במבנה האחיד של trackingSource
const TRACK_SOURCE_OF = { 'local-tesseract': 'local', profile: 'profile', manual: 'manual' };
const STORED_SOURCE_OF = { local: 'local-tesseract', profile: 'profile', manual: 'manual' };

class LayoutError extends Error {}
const fail = (msg) => {
  throw new LayoutError(msg);
};

/**
 * @param {unknown} s
 * @returns {[number, number]|null}
 */
export function parseSize(s) {
  if (!Array.isArray(s) || s.length !== 2) return null;
  const [w, h] = s;
  const ok = (n) => Number.isInteger(n) && n > 0 && n <= PAGE_LAYOUT_LIMITS.maxSide;
  return ok(w) && ok(h) ? [w, h] : null;
}

function parseBox(b, [w, h], where) {
  if (!Array.isArray(b) || b.length !== 4 || !b.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    fail(`${where}: תיבה לא תקינה (נדרשים ארבעה מספרים)`);
  }
  const t = PAGE_LAYOUT_LIMITS.boundsTolerance;
  const [x0, y0, x1, y1] = b;
  if (x0 < -t || y0 < -t || x1 > w + t || y1 > h + t) fail(`${where}: התיבה חורגת מגבולות התמונה`);
  const c = [Math.max(0, x0), Math.max(0, y0), Math.min(w, x1), Math.min(h, y1)].map(round2);
  if (!(c[2] > c[0]) || !(c[3] > c[1])) fail(`${where}: תיבה ריקה או הפוכה`);
  return c;
}

/**
 * ולידציה מחמירה + נרמול של גוף ה-PUT (החלק של הפריסה). זורק אף פעם — מחזיר שגיאה בעברית.
 * @param {any} body
 * @param {{ expectedSize?: [number, number]|null }} [opts]
 *   expectedSize — ממדי התמונה בפועל (מהשרת); אם ידועים, size חייב להיות זהה
 * @returns {{ ok: true, value: { source: string, size: [number, number], lines: any[], wordCount: number } } | { ok: false, error: string }}
 */
export function validatePageLayoutInput(body, { expectedSize = null } = {}) {
  try {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('גוף הבקשה אינו תקין');
    if (!PAGE_LAYOUT_SOURCES.includes(body.source)) fail('מקור התיבות אינו תקין');
    const size = parseSize(body.size);
    if (!size) fail(`ממדי התמונה אינם תקינים (מספרים שלמים חיוביים עד ${PAGE_LAYOUT_LIMITS.maxSide})`);
    if (expectedSize && (expectedSize[0] !== size[0] || expectedSize[1] !== size[1])) {
      fail('ממדי התמונה אינם תואמים לתמונת העמוד — ייתכן שהתמונה הוחלפה, טען את העמוד מחדש');
    }
    if (!Array.isArray(body.lines)) fail('רשימת השורות חסרה');
    if (!body.lines.length) fail('אין שורות לשמירה');
    if (body.lines.length > PAGE_LAYOUT_LIMITS.maxLines) fail(`יותר מדי שורות (עד ${PAGE_LAYOUT_LIMITS.maxLines})`);
    let wordCount = 0;
    const lines = body.lines.map((l, i) => {
      const where = `שורה ${i + 1}`;
      if (!l || typeof l !== 'object' || Array.isArray(l)) fail(`${where}: מבנה לא תקין`);
      const line = { bbox: parseBox(l.bbox, size, where), stream: 'main', words: [] };
      if (l.stream !== undefined && l.stream !== null) {
        if (typeof l.stream !== 'string' || !STREAM_RE.test(l.stream)) fail(`${where}: שם זרם לא תקין`);
        line.stream = l.stream;
      }
      const words = l.words === undefined || l.words === null ? [] : l.words;
      if (!Array.isArray(words)) fail(`${where}: רשימת המילים אינה תקינה`);
      if (words.length > PAGE_LAYOUT_LIMITS.maxWordsPerLine) fail(`${where}: יותר מדי מילים (עד ${PAGE_LAYOUT_LIMITS.maxWordsPerLine})`);
      wordCount += words.length;
      if (wordCount > PAGE_LAYOUT_LIMITS.maxWords) fail(`יותר מדי מילים בעמוד (עד ${PAGE_LAYOUT_LIMITS.maxWords})`);
      line.words = words.map((w, j) => {
        const ww = `${where}, מילה ${j + 1}`;
        if (!w || typeof w !== 'object' || Array.isArray(w)) fail(`${ww}: מבנה לא תקין`);
        const out = { bbox: parseBox(w.bbox, size, ww) };
        if (w.text !== undefined && w.text !== null) {
          if (typeof w.text !== 'string') fail(`${ww}: טקסט לא תקין`);
          const t = w.text.trim();
          if (t.length > PAGE_LAYOUT_LIMITS.maxTextLength) fail(`${ww}: טקסט ארוך מדי (עד ${PAGE_LAYOUT_LIMITS.maxTextLength} תווים)`);
          if (t) out.text = t;
        }
        if (w.conf !== undefined && w.conf !== null) {
          if (typeof w.conf !== 'number' || !Number.isFinite(w.conf) || w.conf < 0 || w.conf > 1) fail(`${ww}: רמת ודאות לא תקינה (0 עד 1)`);
          out.conf = round2(w.conf);
        }
        return out;
      });
      return line;
    });
    return { ok: true, value: { source: body.source, size, lines, wordCount } };
  } catch (e) {
    if (e instanceof LayoutError) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * גרסה צפויה לבדיקת התנגשות (expectedVersion): undefined = בלי בדיקה; 0 = "אין עדיין רשומה".
 * @param {unknown} v
 * @returns {{ ok: true, value: number|undefined } | { ok: false, error: string }}
 */
export function parseExpectedVersion(v) {
  if (v === undefined || v === null) return { ok: true, value: undefined };
  if (!Number.isSafeInteger(v) || /** @type {number} */ (v) < 0) return { ok: false, error: 'גרסה צפויה לא תקינה' };
  return { ok: true, value: /** @type {number} */ (v) };
}

/**
 * ממדי התמונה כפי שהדפדפן מציג אותה (EXIF orientation 5–8 מחליף רוחב וגובה).
 * @param {{ width?: number|null, height?: number|null, orientation?: number|null }|null} image
 * @returns {[number, number]|null}
 */
export function displaySize(image) {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height)) return null;
  const o = image.orientation ?? 1;
  return o >= 5 && o <= 8 ? [image.height, image.width] : [image.width, image.height];
}

/**
 * מבנה אחיד של trackingSource (למשל תוצאת fromTesseract) → גוף PUT.
 * @param {any} track
 * @param {{ source?: string, includeText?: boolean }} [opts]
 * @returns {{ source: string, size: [number, number], lines: any[] } | null} null אם אין מה לשמור
 */
export function trackToStored(track, { source, includeText = true } = {}) {
  const stored = source || STORED_SOURCE_OF[track?.source];
  const size = parseSize(track?.size?.map?.((n) => Math.round(n)));
  if (!stored || !size || !Array.isArray(track?.lines) || !track.lines.length) return null;
  const [w, h] = size;
  const clip = (b) => [Math.max(0, b[0]), Math.max(0, b[1]), Math.min(w, b[2]), Math.min(h, b[3])].map(round2);
  const ok = (b) => b[2] > b[0] && b[3] > b[1];
  const lines = track.lines
    .slice(0, PAGE_LAYOUT_LIMITS.maxLines)
    .map((l) => {
      const bbox = clip(l.bbox);
      const words = (l.words || []).slice(0, PAGE_LAYOUT_LIMITS.maxWordsPerLine).map((wd) => {
        const out = { bbox: clip(wd.bbox) };
        if (includeText && typeof wd.text === 'string' && wd.text.trim()) out.text = wd.text.trim().slice(0, PAGE_LAYOUT_LIMITS.maxTextLength);
        if (Number.isFinite(wd.conf)) out.conf = Math.max(0, Math.min(1, round2(wd.conf)));
        return out;
      }).filter((wd) => ok(wd.bbox));
      const line = { bbox, words };
      if (typeof l.stream === 'string' && STREAM_RE.test(l.stream) && l.stream !== 'main') line.stream = l.stream;
      return line;
    })
    .filter((l) => ok(l.bbox));
  if (!lines.length) return null;
  // תקרת המילים הכוללת — חותכים שורות מהסוף (עדיף פחות שורות שלמות מאשר שורות ריקות)
  let total = 0;
  const capped = [];
  for (const l of lines) {
    if (total + l.words.length > PAGE_LAYOUT_LIMITS.maxWords) break;
    total += l.words.length;
    capped.push(l);
  }
  return capped.length ? { source: stored, size, lines: capped } : null;
}

/**
 * רשומה שמורה (מה-API) → המבנה האחיד של trackingSource. מילים ממוינות מימין לשמאל.
 * @param {any} stored
 * @returns {{ level: 'word'|'line'|'off', source: string|null, size: [number, number]|null, lines: any[] }}
 */
export function storedToTrack(stored) {
  const off = { level: /** @type {'off'} */ ('off'), source: null, size: null, lines: [] };
  const size = parseSize(stored?.size);
  const source = TRACK_SOURCE_OF[stored?.source];
  if (!size || !source || !Array.isArray(stored?.lines)) return off;
  const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[2] > b[0] && b[3] > b[1];
  const lines = stored.lines
    .filter((l) => l && isBox(l.bbox))
    .map((l, i) => {
      const line = { id: `s${i}`, stream: typeof l.stream === 'string' && l.stream ? l.stream : 'main', bbox: [...l.bbox] };
      const words = (Array.isArray(l.words) ? l.words : [])
        .filter((w) => w && isBox(w.bbox))
        .map((w) => {
          const out = { bbox: [...w.bbox] };
          if (typeof w.text === 'string' && w.text) out.text = w.text;
          if (Number.isFinite(w.conf)) out.conf = w.conf;
          return out;
        })
        .sort((a, b) => b.bbox[0] - a.bbox[0] || b.bbox[2] - a.bbox[2]);
      if (words.length) line.words = words;
      return line;
    });
  if (!lines.length) return off;
  return { level: lines.some((l) => l.words) ? 'word' : 'line', source, size, lines };
}
