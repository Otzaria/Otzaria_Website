// צורת הדף — העלאה מחולקת של חבילות (ZIP עד ~2GB): חישובים טהורים בלי DOM ובלי רשת.
// החלוקה לחלקים, אילו חלקים עוד חסרים (המשך העלאה), מפתח ההמשך ב-localStorage, ופורמט בתים.
// הפרוטוקול: docs/tzurat-hadaf/CONTRACT.md ("ניהול" — uploads).
import { fileSizeText } from '@/lib/adminList/fileSize'

export const CHUNK_TRIES = 3
export const POLL_MS = 5000
export const RESUME_STORE = 'tzurat-hadaf:uploads'
// מפתחות המשך ישנים מזה נמחקים (העלאה שנזנחה)
export const RESUME_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
export const MAX_ERRORS_SHOWN = 20

/** מצבי העלאה שבהם העבודה הסתיימה (אין עוד מה לבדוק). */
export const TERMINAL = Object.freeze(['done', 'failed'])
export const isTerminal = (status) => TERMINAL.includes(status)

/** החלקים של קובץ בגודל size: [{n, start, end}] (end לא כולל). קובץ ריק — אין חלקים. */
export function planChunks(size, chunkSize) {
  const total = Number(size)
  const step = Number(chunkSize)
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(step) || step <= 0) return []
  const out = []
  for (let n = 0, start = 0; start < total; n++, start += step) {
    out.push({ n, start, end: Math.min(total, start + step) })
  }
  return out
}

/** החלקים שעוד לא התקבלו בשרת (received — מספרי חלקים). */
export function pendingChunks(plan, received) {
  const got = new Set((received || []).map(Number))
  return plan.filter((c) => !got.has(c.n))
}

/** כמה בתים כבר בשרת, לפי רשימת החלקים שהתקבלו. */
export function receivedBytes(plan, received) {
  const got = new Set((received || []).map(Number))
  return plan.reduce((sum, c) => (got.has(c.n) ? sum + (c.end - c.start) : sum), 0)
}

/** המתנה לפני ניסיון חוזר של חלק (ניסיון 1 → 1 שנייה, 2 → 2, 3 → 4…), עד 30 שניות. */
export const backoffMs = (attempt, base = 1000) => Math.min(30000, base * 2 ** Math.max(0, attempt - 1))

/** מזהה יציב לקובץ מקומי — אותו קובץ שנבחר שוב (גם אחרי רענון) מקבל אותו מפתח. */
export const resumeKey = (file) => `${file?.name || ''}|${Number(file?.size) || 0}|${Number(file?.lastModified) || 0}`

// localStorage עשוי להיות חסום (גלישה פרטית, הגדרות) — כל גישה עטופה
function readStore(storage) {
  try {
    const raw = storage?.getItem(RESUME_STORE)
    const v = raw ? JSON.parse(raw) : {}
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

function writeStore(storage, map) {
  try {
    storage?.setItem(RESUME_STORE, JSON.stringify(map))
  } catch {
    // אין אחסון — ההמשך אחרי רענון פשוט לא יוצע
  }
}

const defaultStorage = () => (typeof window !== 'undefined' ? window.localStorage : null)

/** מזהה ההעלאה שנשמר לקובץ (או null). */
export function findResume(file, storage = defaultStorage(), now = Date.now()) {
  const rec = readStore(storage)[resumeKey(file)]
  if (!rec || typeof rec.id !== 'string' || !rec.id) return null
  if (Number(rec.at) && now - Number(rec.at) > RESUME_MAX_AGE_MS) return null
  return rec.id
}

/** שמירת מזהה ההעלאה לקובץ, וניקוי רשומות ישנות. */
export function rememberResume(file, id, storage = defaultStorage(), now = Date.now()) {
  const map = readStore(storage)
  for (const [k, v] of Object.entries(map)) {
    if (!v || !Number(v.at) || now - Number(v.at) > RESUME_MAX_AGE_MS) delete map[k]
  }
  map[resumeKey(file)] = { id, at: now }
  writeStore(storage, map)
}

/** הסרת מפתח ההמשך (ההעלאה הושלמה או נזנחה). */
export function forgetResume(file, storage = defaultStorage()) {
  const map = readStore(storage)
  if (!(resumeKey(file) in map)) return
  delete map[resumeKey(file)]
  writeStore(storage, map)
}

/** "1.5 GB", "320 MB", "12 KB", "512 B" — בנוסח האחיד של הניהול (adminList/fileSize.js); לא תקין — "—". */
export function formatBytes(n) {
  return fileSizeText(n) || '—'
}

/** אחוז שלם 0–100 (בלי חלוקה באפס). */
export function percent(part, total) {
  const t = Number(total)
  if (!Number.isFinite(t) || t <= 0) return 0
  return Math.max(0, Math.min(100, Math.floor((Number(part) / t) * 100)))
}
