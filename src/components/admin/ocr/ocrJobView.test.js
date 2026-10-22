import { describe, it, expect } from 'vitest'
import { ALL_STATUSES } from '@/lib/ocr/localJobState'
import { DEFAULT_LOCAL_OPTIONS, LOCAL_OPTION_VALUES } from '@/lib/ocr/localJobCreate.pure'
import {
  salvageLabel,
  warningLabel,
  WARNING_LABELS,
  LOCAL_DEFAULT_OPTIONS,
  LOCAL_LM_OPTIONS,
  LOCAL_SCRIPT_OPTIONS,
  attentionReason,
  isRequeued,
  canCancel,
  canResumePreparation,
  cancelReasonLabel,
  resumePreparationPayload,
  formatBytes,
  formatLastSeen,
  isWorkerUnavailable,
  jobShortId,
  jobErrorText,
  methodLabel,
  pollIntervalMs,
  progressCounts,
  progressPercent,
  rejectionReasonLabel,
  resumeIssue,
  shortSha,
  statusIcon,
  statusLabel,
  statusTone,
  summaryParts,
} from './ocrJobView'

describe('statusLabel / statusTone / statusIcon', () => {
  it('לכל מצב תווית עברית, גוון ואייקון', () => {
    for (const s of ALL_STATUSES) {
      expect(statusLabel(s)).not.toBe('מצב לא ידוע')
      expect(statusTone(s)).toMatch(/^(neutral|info|warning|error|success)$/)
      expect(statusIcon(s)).not.toBe('help')
    }
  })

  it('התוויות הנדרשות', () => {
    expect(statusLabel('queued')).toBe('ממתין למחשב המקומי')
    expect(statusLabel('paused_runner')).toBe('מושהה — GitHub Runner פעיל')
    expect(statusLabel('cancelled')).toBe('בוטל')
    expect(statusTone('needs_attention')).toBe('error')
    expect(statusTone('completed')).toBe('success')
  })

  it('מצב לא מוכר', () => {
    expect(statusLabel('weird')).toBe('מצב לא ידוע')
    expect(statusTone(undefined)).toBe('neutral')
  })
})

describe('progress', () => {
  it('local — לפי progress של העובד, ונפילה ל-totalPages', () => {
    const job = { method: 'local', status: 'running', progress: { pagesDone: 30, pagesTotal: 120 }, totalPages: 100 }
    expect(progressCounts(job)).toEqual({ done: 30, total: 120 })
    expect(progressPercent(job)).toBe(25)
    expect(progressCounts({ method: 'local', progress: { pagesDone: 0, pagesTotal: 0 }, totalPages: 8 })).toEqual({ done: 0, total: 8 })
  })

  it('שרת — processedPages/totalPages', () => {
    expect(progressPercent({ method: 'ocrwin', processedPages: 1, totalPages: 3 })).toBe(33)
  })

  it('גבולות: אין סך → 0, חריגה → 100', () => {
    expect(progressPercent({ method: 'local', progress: {} })).toBe(0)
    expect(progressPercent({ method: 'local', progress: { pagesDone: 9, pagesTotal: 3 } })).toBe(100)
    expect(progressPercent(null)).toBe(0)
  })
})

describe('canCancel', () => {
  it('פעילה שטרם החלה בקליטה', () => {
    for (const s of ['preparing', 'queued', 'running', 'pausing', 'paused_runner', 'delivery_pending', 'needs_attention']) {
      expect(canCancel({ method: 'local', status: s, decision: null })).toBe(true)
    }
  })

  it('applying / decision=apply / סופית — לא', () => {
    expect(canCancel({ method: 'local', status: 'applying' })).toBe(false)
    expect(canCancel({ method: 'local', status: 'delivery_pending', decision: 'apply' })).toBe(false)
    expect(canCancel({ method: 'local', status: 'cancelled' })).toBe(false)
    expect(canCancel(null)).toBe(false)
  })
})

describe('pollIntervalMs', () => {
  it('local 10 שניות, שרת 2.5 שניות, לא פעילה — בלי polling', () => {
    expect(pollIntervalMs({ method: 'local', status: 'queued' })).toBe(10000)
    expect(pollIntervalMs({ method: 'ocrwin', status: 'running' })).toBe(2500)
    expect(pollIntervalMs({ method: 'local', status: 'completed' })).toBeNull()
    expect(pollIntervalMs(null)).toBeNull()
  })
})

describe('methodLabel', () => {
  it('שלושת הספקים', () => {
    expect(methodLabel({ method: 'gemini', model: 'gemini-2.5-pro' })).toBe('Gemini · gemini-2.5-pro')
    expect(methodLabel({ method: 'ocrwin' })).toBe('OCRWin')
    expect(methodLabel({ method: 'local' })).toBe('מחשב מקומי')
  })
})

describe('formatLastSeen', () => {
  const now = new Date('2026-10-20T12:00:00Z')
  const ago = (ms) => new Date(now.getTime() - ms).toISOString()
  it('זמן יחסי', () => {
    expect(formatLastSeen(null, now)).toBe('מעולם לא התחבר')
    expect(formatLastSeen('garbage', now)).toBe('מעולם לא התחבר')
    expect(formatLastSeen(ago(20_000), now)).toBe('לפני פחות מדקה')
    expect(formatLastSeen(ago(60_000), now)).toBe('לפני דקה')
    expect(formatLastSeen(ago(5 * 60_000), now)).toBe('לפני 5 דקות')
    expect(formatLastSeen(ago(60 * 60_000), now)).toBe('לפני שעה')
    expect(formatLastSeen(ago(2 * 60 * 60_000), now)).toBe('לפני שעתיים')
    expect(formatLastSeen(ago(7 * 60 * 60_000), now)).toBe('לפני 7 שעות')
    expect(formatLastSeen(ago(30 * 60 * 60_000), now)).toBe('אתמול')
    expect(formatLastSeen(ago(5 * 24 * 60 * 60_000), now)).not.toMatch(/^לפני/)
  })
})

describe('isWorkerUnavailable', () => {
  const active = { method: 'local', status: 'queued' }
  it('offline / never / לא מוגדר — רק לעבודת local פעילה', () => {
    expect(isWorkerUnavailable(active, { configured: true, availability: 'offline' })).toBe(true)
    expect(isWorkerUnavailable(active, { configured: true, availability: 'never' })).toBe(true)
    expect(isWorkerUnavailable(active, { configured: false, availability: 'never' })).toBe(true)
    expect(isWorkerUnavailable(active, { configured: true, availability: 'online' })).toBe(false)
    expect(isWorkerUnavailable({ method: 'local', status: 'completed' }, { availability: 'offline' })).toBe(false)
    expect(isWorkerUnavailable({ method: 'ocrwin', status: 'running' }, { availability: 'offline' })).toBe(false)
    expect(isWorkerUnavailable(active, null)).toBe(false)
  })
})

describe('נוסחי סיכום', () => {
  it('סיבת ביטול', () => {
    expect(cancelReasonLabel({ cancelReason: 'admin', cancelledByName: 'רבי משה' })).toBe('בוטלה בידי רבי משה')
    expect(cancelReasonLabel({ cancelReason: 'admin' })).toBe('בוטלה בידי מנהל')
    expect(cancelReasonLabel({ cancelReason: 'book_deleted' })).toBe('בוטלה עקב מחיקת הספר')
    expect(cancelReasonLabel({ cancelReason: 'book_merged' })).toBe('בוטלה עקב מיזוג ספרים')
    expect(cancelReasonLabel({})).toBe('בוטלה')
  })

  it('שגיאה: השמורה קודמת, אחר כך לפי קוד', () => {
    expect(jobErrorText({ error: 'X: y', errorCode: 'no_pages_succeeded' })).toBe('X: y')
    expect(jobErrorText({ errorCode: 'no_pages_succeeded' })).toMatch(/אף עמוד לא נקלט/)
    expect(jobErrorText({})).toBe('שגיאה לא ידועה')
  })

  it('summaryParts', () => {
    const parts = summaryParts({ summary: { applied: 7, failed: 1, conflicts: 2, missing: 0 } })
    expect(parts.map((p) => [p.label, p.value])).toEqual([
      ['הוחלו', 7], ['נכשלו', 1], ['התנגשויות', 2], ['עמודים שנמחקו', 0],
    ])
  })

  it('סיבת דחייה וגודל', () => {
    expect(rejectionReasonLabel('validation_failed')).toBe('התוצאה לא עברה בדיקת תקינות')
    expect(rejectionReasonLabel('x')).toBe('התוצאה נדחתה')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(formatBytes(null)).toBe('')
    expect(formatBytes('x')).toBe('')
  })
})

describe('אפשרויות העיבוד המקומי', () => {
  it('זהות ל-whitelist ולברירות המחדל של השרת', () => {
    expect(LOCAL_DEFAULT_OPTIONS).toEqual(DEFAULT_LOCAL_OPTIONS)
    expect(LOCAL_LM_OPTIONS.map((o) => o.value)).toEqual([...LOCAL_OPTION_VALUES.lm])
    expect(LOCAL_SCRIPT_OPTIONS.map((o) => o.value)).toEqual([...LOCAL_OPTION_VALUES.defaultScript])
  })
})

describe('canResumePreparation / resumePreparationPayload', () => {
  const prep = { method: 'local', status: 'preparing', requestId: 'req-12345678', existingTextMode: 'skip', options: { lm: 'modern', defaultScript: 'rashi' } }
  it('רק עבודת local בהכנה עם requestId, כשה-lease פג או שהבקשה האחרונה דורשת המשך', () => {
    expect(canResumePreparation({ ...prep, preparingStale: true })).toBe(true)
    expect(canResumePreparation({ ...prep, preparingStale: false })).toBe(false)
    expect(canResumePreparation({ ...prep, preparingStale: false }, { lastStartNeedsResume: true })).toBe(true)
    expect(canResumePreparation({ ...prep, preparingStale: true, requestId: null })).toBe(false)
    expect(canResumePreparation({ ...prep, preparingStale: true, status: 'queued' })).toBe(false)
    expect(canResumePreparation({ ...prep, preparingStale: true, method: 'ocrwin' })).toBe(false)
    expect(canResumePreparation(null)).toBe(false)
  })
  it('הגוף — אותו requestId ואותם פרמטרים של העבודה, בלי שדות זרים', () => {
    expect(resumePreparationPayload({ ...prep, options: { ...prep.options, extra: 1 } }, 'b1')).toEqual({
      bookId: 'b1',
      method: 'local',
      requestId: 'req-12345678',
      existingTextMode: 'skip',
      options: { lm: 'modern', defaultScript: 'rashi' },
    })
  })
})

describe('resumeIssue', () => {
  it('תקלה פתוחה רק כשיש קוד ואין ack; קוד לא מוכר — עם הקוד', () => {
    expect(resumeIssue(null)).toBeNull()
    expect(resumeIssue({ resumeErrorCode: null })).toBeNull()
    expect(resumeIssue({ resumeErrorCode: 'result_unavailable', ackAt: '2026-10-20T10:00:00Z' })).toBeNull()
    const r = resumeIssue({
      resumeErrorCode: 'result_unavailable',
      resumeFailedAt: '2026-10-20T10:00:00Z',
      resumeRetryAt: '2026-10-20T11:00:00Z',
      resumeFailures: 1,
      ackAt: null,
    })
    expect(r.label).toBe('קובץ התוצאה השמור חסר באחסון')
    expect(r.failures).toBe(1)
    expect(r.retryAt).not.toBe('')
    expect(resumeIssue({ resumeErrorCode: 'EACCES' }).label).toBe('שגיאה (EACCES)')
    expect(resumeIssue({ resumeErrorCode: 'result_corrupt' }).retryAt).toBe('')
  })
})

describe('shortSha / jobShortId', () => {
  it('קיצורים לתצוגה, ומחרוזת ריקה לקלט לא תקין', () => {
    expect(shortSha('a'.repeat(64))).toBe('a'.repeat(12))
    expect(shortSha(undefined)).toBe('')
    expect(jobShortId('64b7f0c2a1b2c3d4e5f6000a')).toBe('#f6000a')
    expect(jobShortId('')).toBe('')
    expect(jobShortId(null)).toBe('')
  })
})

// קודי הסיבה ש-StatusReporter.AttentionText בשירות שולח ב-message של needs_attention (גרסה 1.0.142),
// עם הטקסט הקבוע. כל אחד חייב לקבל תווית עברית משלו (לא את תווית "לא מוכרת").
const SERVICE_ATTENTION = {
  manifest_conflict: 'the site sent different immutable data (options, pageMap or input hash) for this job; the original is kept',
  jobid_case_conflict: 'the site sent this jobId in another letter case',
  device_missing: 'the required AMD GPU is not available to the worker',
  pipeline_misconfigured: 'the OCR pipeline on the worker is not installed or configured correctly',
  process_tree_alive: 'an earlier OCR process on the worker did not exit',
  crash_loop: 'the worker service was interrupted too many times during this job',
  input_hash_mismatch: 'the downloaded PDF does not match inputSha256',
  input_unavailable: 'the site refused the PDF download',
  delivery_rejected: 'the site rejected the result; it is kept on the worker',
  result_conflict: "the site holds a different result for this job (409); the worker's result is kept",
  invalid_ack: "the site's answer to the result was not a valid acknowledgement; the result is kept",
  output_missing: "the worker's frozen result file is missing",
  output_corrupt: "the worker's frozen result file changed on disk",
  output_unknown: 'the worker has no frozen result recorded for this job',
  output_path_invalid: "the worker's result path is invalid",
}
const HEBREW = /[֐-׿]/

describe('attentionReason (הודעת needs_attention של העובד)', () => {
  it('לכל סיבה שהשירות שולח — תווית עברית ייחודית, וההודעה המקורית נשמרת כ-detail', () => {
    const labels = new Set()
    for (const [code, text] of Object.entries(SERVICE_ATTENTION)) {
      const message = `${code}: ${text}`
      const r = attentionReason(message)
      expect(r.code, code).toBe(code)
      expect(r.label, code).toMatch(HEBREW)
      expect(r.label, code).not.toContain('אינה מוכרת')
      expect(r.detail).toBe(message)
      labels.add(r.label)
    }
    expect(labels.size).toBe(Object.keys(SERVICE_ATTENTION).length)
  })

  it('manifest_conflict ו-delivery_rejected (HANDOVER 3.1 פריט 8) — עם פעולה מוצעת', () => {
    const conflict = attentionReason(`manifest_conflict: ${SERVICE_ATTENTION.manifest_conflict}`)
    expect(conflict.label).toContain('נתונים שונים')
    expect(conflict.action).toMatch(HEBREW)
    expect(attentionReason(`delivery_rejected: ${SERVICE_ATTENTION.delivery_rejected}`).action).toContain('retry-delivery')
    expect(attentionReason(`device_missing: ${SERVICE_ATTENTION.device_missing}`).action).toBeNull()
  })

  it('קוד חשוף (בלי טקסט), unknown, קוד שאינו מוכר לאתר והודעה בפורמט אחר', () => {
    expect(attentionReason('crash_loop')).toMatchObject({ code: 'crash_loop', detail: 'crash_loop' })
    expect(attentionReason('crash_loop').label).toBe(attentionReason(`crash_loop: ${SERVICE_ATTENTION.crash_loop}`).label)
    expect(attentionReason('unknown').label).toMatch(HEBREW)
    expect(attentionReason('unknown').label).not.toContain('אינה מוכרת')
    expect(attentionReason('some_new_code: new text')).toMatchObject({ code: 'some_new_code', label: 'סיבה שאינה מוכרת לאתר (some_new_code)', action: null })
    expect(attentionReason('Recognizing pages')).toMatchObject({ code: null, label: 'סיבה שאינה מוכרת לאתר', detail: 'Recognizing pages' })
    // שם של מאפיין מובנה של אובייקט אינו "סיבה מוכרת"
    expect(attentionReason('constructor').label).toBe('סיבה שאינה מוכרת לאתר (constructor)')
  })

  it('הודעה ריקה / חסרה → null', () => {
    for (const m of [undefined, null, '', '   ', 42]) expect(attentionReason(m)).toBeNull()
  })
})

describe('isRequeued (עבודה שחזרה לתור במחשב המקומי)', () => {
  it('רק עבודת local ב-queued שהעובד דיווח עליה queued', () => {
    expect(isRequeued({ method: 'local', status: 'queued', workerState: 'queued' })).toBe(true)
    expect(isRequeued({ method: 'local', status: 'queued', workerState: null })).toBe(false)
    expect(isRequeued({ method: 'local', status: 'running', workerState: 'running' })).toBe(false)
    expect(isRequeued({ method: 'gemini', status: 'queued', workerState: 'queued' })).toBe(false)
    expect(isRequeued(null)).toBe(false)
  })
})

describe('warningLabel / salvageLabel (נתוני פריסה ועזר מהעובד המקומי)', () => {
  it('תווית עברית לכל קוד ברישום; קוד לא מוכר — חשוף', () => {
    for (const code of [
      'layout_alts_trimmed', 'layout_too_large', 'layout_dropped_result_size', 'layout_geometry_unknown', 'layout_build_failed',
      'layout_invalid_shape', 'layout_invalid', 'layout_version_unsupported', 'layout_image_mismatch', 'metadata_too_large',
      'warnings_invalid_shape', 'metadata_invalid_shape',
    ]) {
      expect(WARNING_LABELS[code]).toBeTruthy()
      expect(warningLabel(code)).toBe(WARNING_LABELS[code])
    }
    expect(warningLabel('new_code')).toBe('אזהרה שאינה מוכרת לאתר (new_code)')
    expect(warningLabel(undefined)).toBe('אזהרה שאינה מוכרת לאתר')
  })
  it('salvageLabel לפי resultMetadata.salvage', () => {
    expect(salvageLabel({ resultMetadata: { salvage: { reason: 'cancelled', pages: 3 } } })).toBe('נשמרו 3 עמודים שזוהו לפני הביטול')
    expect(salvageLabel({ resultMetadata: { salvage: { reason: 'failed', pages: 1 } } })).toBe('נשמר עמוד אחד שזוהה לפני הכשל')
    expect(salvageLabel({ resultMetadata: {} })).toBe(null)
    expect(salvageLabel({})).toBe(null)
  })
})
