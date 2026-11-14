import { listRecords, readRecord, writeRecord } from './store'

export async function syncRecord(key) {
  return navigator.locks.request(`sync:${key}`, async () => {
    for (;;) {
      const record = readRecord(key)
      if (!record?.draft || record.problem?.code === 'OFFLINE_CONFLICT') return !record?.draft
      // Persist the in-flight request separately: later keystrokes and a lost response must not
      // erase the receipt needed for an exact retry after a crash/reload.
      const flight = record.inFlight || { draft: record.draft, baseVersion: record.baseVersion }
      if (!record.inFlight) writeRecord({ ...record, inFlight: flight })
      const draft = flight.draft
      let response, result
      try {
        response = await fetch('/api/page-content', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000),
          body: JSON.stringify({ ...draft, baseVersion: flight.baseVersion, expectedUserId: record.user.id }),
        })
        result = await response.json()
      } catch { return false }
      const latest = readRecord(key)
      if (!latest) return false
      if (!response.ok || !result.success || !result.contentVersion) {
        writeRecord({ ...latest, inFlight: response.status >= 500 ? flight : null, problem: {
          code: result.code || String(response.status), message: result.error || 'הסנכרון נעצר. התחברו מחדש ובדקו את ההרשאות.',
        } })
        return false
      }
      writeRecord({ ...latest, baseVersion: result.contentVersion, data: { ...latest.data, ...draft,
        contentVersion: result.contentVersion,
        ocrWordReview: result.ocrWordReviewDropped ? null : draft.ocrWordReview,
      }, draft: latest.draft?.offlineSaveId === draft.offlineSaveId ? null : latest.draft, inFlight: null, problem: null })
      if (navigator.onLine === false) return !readRecord(key)?.draft
    }
  })
}
export async function syncAll(userId) {
  if (navigator.onLine === false || !navigator.locks) return
  for (const record of listRecords(userId)) {
    if (navigator.onLine === false) break
    if (record.draft) {
      const synced = await syncRecord(record.key)
      if (!synced && !readRecord(record.key)?.problem) break
    }
  }
}
