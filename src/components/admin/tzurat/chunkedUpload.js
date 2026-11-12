// צורת הדף — מנוע ההעלאה המחולקת (בלי React): יצירת העלאה, שליחת החלקים אחד אחרי השני עם ניסיונות
// חוזרים, דילוג על חלקים שכבר בשרת (המשך העלאה — גם אחרי רענון, לפי localStorage), "סיום" (202),
// ומעקב אחרי העיבוד ברקע. הפרוטוקול: CONTRACT.md ("ניהול" — uploads).
//
// חלק שנכשל 3 פעמים לא עוצר את השאר: ממשיכים לחלקים הבאים, ובסוף מדווחים כמה חסרים — "המשך העלאה"
// ישלח רק אותם (השרת יודע מה התקבל).

import { SESSION_EXPIRED_MESSAGE } from '@/components/admin/list/adminRequest'
import { apiCall, API, isSessionExpired, replyError } from './adminApi'
import {
  CHUNK_TRIES,
  POLL_MS,
  backoffMs,
  findResume,
  forgetResume,
  isTerminal,
  pendingChunks,
  planChunks,
  receivedBytes,
  rememberResume,
} from './uploadPlan'

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms))

// סטטוסים שבהם אין טעם לנסות שוב את אותו חלק (הבקשה עצמה פסולה)
const FATAL = new Set([400, 401, 403, 404, 409, 413])

/** פרטי העלאה קיימת (או null). */
export async function fetchUpload(id, fetchFn) {
  const r = await apiCall(`uploads/${encodeURIComponent(id)}`, { fetchFn })
  return r.ok ? r.data?.upload || null : null
}

async function putChunk(id, chunk, file, { fetchFn, tries, sleep }) {
  let last = null
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await (fetchFn || globalThis.fetch)(`${API}/uploads/${encodeURIComponent(id)}/chunks/${chunk.n}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file.slice(chunk.start, chunk.end),
        // הפניה לדף ההתחברות — התחברות שפגה, לא "חלק שהתקבל"
        redirect: 'manual',
      })
      if (isSessionExpired(res)) return { ok: false, fatal: true, error: SESSION_EXPIRED_MESSAGE }
      if (res.ok) {
        const d = await res.json().catch(() => null)
        return { ok: true, received: Array.isArray(d?.received) ? d.received : null }
      }
      const d = await res.json().catch(() => null)
      last = replyError(res.status, d, `חלק ${chunk.n + 1}: שגיאה ${res.status}`)
      if (FATAL.has(res.status)) return { ok: false, fatal: true, error: last }
    } catch {
      last = `חלק ${chunk.n + 1}: אין חיבור לשרת`
    }
    if (attempt < tries) await sleep(backoffMs(attempt))
  }
  return { ok: false, fatal: false, error: last }
}

/**
 * מעלה קובץ אחד. מחזיר:
 *  {ok:true, upload} — כל החלקים בשרת ו"סיום" התקבל (202) — העיבוד ברקע;
 *  {ok:false, id, error, missing?, stopped?} — אפשר "המשך העלאה" (resume) לאותו id.
 * אפשרויות: fetchFn, onProgress({id, sent, total, chunk, chunks}), resume (true — לחפש מזהה שמור),
 * resumeId (מזהה מפורש), shouldStop() (עצירה אחרי החלק הנוכחי), sleep, tries, storage.
 */
export async function uploadFile(file, opts = {}) {
  const { fetchFn, onProgress, shouldStop = () => false, sleep = realSleep, tries = CHUNK_TRIES, storage } = opts
  const total = Number(file?.size) || 0
  let up = null

  const resumeId = opts.resumeId || (opts.resume ? findResume(file, storage) : null)
  if (resumeId) {
    const prev = await fetchUpload(resumeId, fetchFn)
    if (prev && prev.name === file.name && Number(prev.size) === total) {
      // כבר הושלמה בעבר — אין מה לשלוח, רק לעקוב
      if (prev.status && prev.status !== 'uploading') {
        forgetResume(file, storage)
        return { ok: true, upload: prev, already: true }
      }
      up = prev
    }
  }

  if (!up) {
    const r = await apiCall('uploads', { method: 'POST', body: { name: file.name, size: total }, fetchFn })
    if (!r.ok || !r.data?.id) return { ok: false, id: null, error: r.error || 'יצירת ההעלאה נכשלה' }
    up = { id: r.data.id, chunkSize: r.data.chunkSize, chunks: r.data.chunks, received: [] }
  }
  rememberResume(file, up.id, storage)

  const plan = planChunks(total, up.chunkSize)
  if (Number.isInteger(up.chunks) && up.chunks !== plan.length) {
    return { ok: false, id: up.id, error: `מספר החלקים לא תואם לשרת (${plan.length} מול ${up.chunks})` }
  }
  const received = new Set((up.received || []).map(Number))
  let sent = receivedBytes(plan, [...received])
  const report = (chunk) => onProgress?.({ id: up.id, sent, total, chunk, chunks: plan.length })
  report(null)

  const failed = []
  for (const c of pendingChunks(plan, [...received])) {
    if (shouldStop()) return { ok: false, id: up.id, stopped: true, error: 'ההעלאה נעצרה', missing: plan.length - received.size }
    const r = await putChunk(up.id, c, file, { fetchFn, tries, sleep })
    if (r.ok) {
      received.add(c.n)
      sent += c.end - c.start
      report(c.n)
    } else {
      failed.push(c.n)
      if (r.fatal) return { ok: false, id: up.id, error: r.error, missing: plan.length - received.size }
    }
  }

  if (failed.length) {
    return {
      ok: false,
      id: up.id,
      missing: failed.length,
      error: `${failed.length} חלקים לא הגיעו לשרת אחרי ${tries} ניסיונות — "המשך העלאה" ישלח רק אותם`,
    }
  }

  const done = await apiCall(`uploads/${encodeURIComponent(up.id)}/complete`, { method: 'POST', body: {}, fetchFn })
  if (!done.ok) {
    // השער אולי הפסיק לחכות אבל הבקשה הגיעה — בודקים את המצב בשרת
    const now = await fetchUpload(up.id, fetchFn)
    if (now && now.status !== 'uploading') {
      forgetResume(file, storage)
      return { ok: true, upload: now }
    }
    return { ok: false, id: up.id, error: done.error || 'סיום ההעלאה נכשל' }
  }
  forgetResume(file, storage)
  return { ok: true, upload: done.data?.upload || { id: up.id, status: 'queued' } }
}

/**
 * מעקב אחרי העיבוד: GET uploads/[id] כל every (5 שניות) עד done/failed, או עד ש-alive() מחזיר false.
 * onUpdate(upload) על כל תשובה. מחזיר את המצב האחרון (או null).
 */
export async function pollUpload(id, { fetchFn, onUpdate, alive = () => true, every = POLL_MS, sleep = realSleep, maxPolls = Infinity } = {}) {
  let last = null
  for (let i = 0; i < maxPolls && alive(); i++) {
    const u = await fetchUpload(id, fetchFn)
    if (!alive()) break
    if (u) {
      last = u
      onUpdate?.(u)
      if (isTerminal(u.status)) return u
    }
    await sleep(every)
  }
  return last
}
