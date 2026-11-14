// צורת הדף — כללי ההעלאה המחולקת של חבילות (טהור). חבילה של מסכת יכולה להגיע ל-400MB ויותר, וה-proxy של
// Next שומר גוף בקשה בזיכרון (וקוטע מעבר ל-proxyClientMaxBodySize) — לכן החבילה עולה בחלקים של 8MB,
// מורכבת על הדיסק ומעובדת ברקע (uploads.js, importPackage.js).

export const CHUNK_SIZE = 8 * 1024 * 1024;
export const MAX_UPLOAD = 2 * 1024 * 1024 * 1024;
export const NAME_RE = /^[\w֐-׿ .()+-]{1,120}\.zip$/i;
// העלאות (וקובצי החבילה שלהן) נמחקות אחרי שבוע
export const UPLOAD_TTL_DAYS = 7;
// עבודת ייבוא שלא דיווחה דופק זמן כזה — נחשבת מתה (pm2 reload) ואפשר להריץ אותה שוב
export const STALE_MS = 3 * 60 * 1000;
export const STATUSES = Object.freeze(['uploading', 'queued', 'processing', 'done', 'failed']);

/** {name, size} ← {name, size, chunkSize, chunks} או {error} */
export function validateCreate(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!NAME_RE.test(name)) return { error: 'שם הקובץ חייב להסתיים ב-.zip (עד 120 תווים, בלי תווים מיוחדים)' };
  const size = b.size;
  if (!Number.isSafeInteger(size) || size <= 0) return { error: 'גודל הקובץ חסר או אינו תקין' };
  if (size > MAX_UPLOAD) return { error: 'הקובץ גדול מדי (עד 2GB)' };
  return { name, size, chunkSize: CHUNK_SIZE, chunks: Math.ceil(size / CHUNK_SIZE) };
}

/** מספר החלק מהכתובת ← מספר שלם בטווח, או null */
export function chunkIndex(raw, chunks) {
  const s = String(raw ?? '');
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = Number(s);
  return n < chunks ? n : null;
}

/** הגודל המדויק של חלק n (האחרון קצר יותר) */
export function expectedChunkSize(n, size, chunkSize, chunks) {
  if (n < chunks - 1) return chunkSize;
  return size - chunkSize * (chunks - 1);
}

export function missingChunks(received, chunks) {
  const have = new Set(received || []);
  const out = [];
  for (let i = 0; i < chunks; i++) if (!have.has(i)) out.push(i);
  return out;
}

// עבודה שאפשר להריץ שוב: נכשלה, הסתיימה, או נתקעה (בלי דופק)
export function canRetry(upload, now = new Date()) {
  if (!upload) return false;
  if (upload.status === 'failed' || upload.status === 'done') return true;
  if (upload.status === 'queued' || upload.status === 'processing') {
    const beat = new Date(upload.heartbeatAt || upload.startedAt || 0).getTime();
    return now.getTime() - beat > STALE_MS;
  }
  return false;
}
