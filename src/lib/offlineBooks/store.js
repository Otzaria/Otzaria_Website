// Small synchronous text journal: each edit reaches durable storage before a debounce or request.
// Scans and application assets live in CacheStorage, never in this quota-limited journal.
export const PREFIX = 'otzaria:offline-book:v1:'
const OWNER = 'otzaria:offline-book:owner'
export const CHANGED = 'otzaria-offline-books-changed'
export const pageKey = (userId, bookPath, pageNumber) => PREFIX + JSON.stringify([String(userId), bookPath, Number(pageNumber)])
export function readRecord(key) {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  const record = JSON.parse(raw)
  if (record.version !== 1 || record.key !== key || typeof record.user?.id !== 'string' || !record.baseVersion ||
      typeof record.bookPath !== 'string' || !Number.isSafeInteger(record.pageNumber) || typeof record.book?.name !== 'string' ||
      typeof record.data?.content !== 'string' || (record.draft && typeof record.draft.content !== 'string')) throw new Error('עותק האופליין אינו תקין. יש לייצא גיבוי לפני מחיקתו.')
  return record
}
export function writeRecord(record) {
  localStorage.setItem(record.key, JSON.stringify(record)) // quota/security failures must reach the UI
  window.dispatchEvent(new Event(CHANGED))
  return record
}
export function listRecords(userId) {
  const records = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PREFIX)) continue
    let record
    try { record = readRecord(key) } catch { continue } // Retain damaged entries for raw export; do not block healthy drafts.
    if (!userId || record.user.id === String(userId)) records.push(record)
  }
  return records
}
export function localSession(bookPath, pageNumber) {
  try {
    const owner = localStorage.getItem(OWNER)
    if (!owner) return null
    const key = pageKey(owner, bookPath, pageNumber)
    if (!localStorage.getItem(key)) return null
    let user = { id: owner, name: 'עותק מקומי' }
    try { user = readRecord(key).user } catch { /* Keep raw backup recovery accessible. */ }
    // This identity only unlocks this local copy; the server always authenticates writes afresh.
    return { user: { ...user, role: 'user' }, offline: true }
  } catch { return null }
}
export function rememberOwner(userId) {
  if (localStorage.getItem(OWNER) === String(userId)) return
  localStorage.setItem(OWNER, String(userId))
  window.dispatchEvent(new Event(CHANGED))
}
export function saveDraft(key, data) {
  const record = readRecord(key)
  if (!record) throw new Error('עותק האופליין חסר. השינויים לא נשמרו במכשיר; הורידו גיבוי.')
  return writeRecord({ ...record, draft: { ...data, offlineSaveId: crypto.randomUUID(), saveRevision: Math.max(Date.now() * 1000, (record.draft?.saveRevision || 0) + 1, (record.data?.saveRevision || 0) + 1) }, problem: record.problem?.code === 'OFFLINE_CONFLICT' ? record.problem : null })
}
export async function removeRecord(key, { ownsEditLock = false } = {}) {
  const remove = async () => {
    const record = readRecord(key)
    if (record?.draft || record?.inFlight) throw new Error('יש שינויים שטרם סונכרנו. סנכרנו או הורידו גיבוי לפני ההסרה.')
    localStorage.removeItem(key)
    window.dispatchEvent(new Event(CHANGED))
    if (record?.cacheName) await caches.delete(record.cacheName)
  }
  // The owning editor may remove its own clean copy; other pages must acquire its edit lock.
  if (ownsEditLock) return remove()
  if (!navigator.locks) throw new Error('הדפדפן אינו מאפשר נעילה להסרה בטוחה')
  return navigator.locks.request(`edit:${key}`, { ifAvailable: true }, async lock => {
    if (!lock) throw new Error('העמוד פתוח בלשונית אחרת. סגרו אותה לפני הסרת העותק.')
    return remove()
  })
}
export function downloadBackup(record) {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `אוצריא-${record.bookPath}-${record.pageNumber}-גיבוי.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function patchPreparedPage(userId, bookPath, pageNumber, patch) {
  const record = readRecord(pageKey(userId, bookPath, pageNumber))
  if (record) writeRecord({ ...record, data: { ...record.data, ...patch } })
}

export function downloadRawCopies(userId) {
  const copies = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PREFIX)) continue
    try { if (JSON.parse(key.slice(PREFIX.length))[0] !== String(userId)) continue } catch { continue }
    copies[key] = localStorage.getItem(key)
  }
  downloadBackup({ bookPath: 'כל-העותקים', pageNumber: '', copies })
}
