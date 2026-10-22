'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Loader from '@/components/ui/Loader'
import LocalOcrOptions from '@/components/admin/ocr/LocalOcrOptions'
import LocalOcrJobProgress from '@/components/admin/ocr/LocalOcrJobProgress'
import OcrJobSummary from '@/components/admin/ocr/OcrJobSummary'
import OcrConflictsPanel from '@/components/admin/ocr/OcrConflictsPanel'
import LocalResultIssues from '@/components/admin/ocr/LocalResultIssues'
import OlderResultConflicts from '@/components/admin/ocr/OlderResultConflicts'
import {
  LOCAL_DEFAULT_OPTIONS,
  canResumePreparation,
  isJobActive,
  isLocalJob,
  pollIntervalMs,
  resumePreparationPayload,
} from '@/components/admin/ocr/ocrJobView'
import {
  START_RETRY_DELAY_MS,
  clearRequestId,
  loadRequestId,
  localParamsKey,
  newRequestId,
  postLocalStart,
  saveRequestId,
} from '@/components/admin/ocr/localStart'

const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (מהיר וזול)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (מדויק)' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (החדש ביותר)' },
]

// השבתה זמנית של Gemini (תואם לחסימה בצד השרת ב-/api/admin/books/ocr/start)
const GEMINI_DISABLED = true

const APPLY_STARTED_HE = 'הקליטה כבר החלה — לא ניתן לבטל'

// sessionStorage עלול לזרוק בגישה עצמה (חלון פרטי / חסימת אחסון)
function sessionStore() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

/**
 * דיאלוג OCR לספר שלם — שלושה ספקים: Gemini (מושבת זמנית), OCRWin (שניהם רצים בשרת),
 * ומחשב מקומי (method=local: העבודה נכנסת לתור ומעובדת בשירות OtzariaTaskAgent).
 * לוגיקת התצוגה הטהורה — src/components/admin/ocr/ocrJobView.js; התחלת local עם requestId
 * וניסיונות חוזרים — src/components/admin/ocr/localStart.js.
 *
 * localRetryDelayMs — ההמתנה בין ניסיונות חוזרים של בקשת local (ניתן לשינוי לטסטים).
 */
export default function BookOcrDialog({ book, onClose, localRetryDelayMs = START_RETRY_DELAY_MS }) {
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({ pagesWithImage: 0, editedPagesCount: 0 })
  const [job, setJob] = useState(null)
  const [worker, setWorker] = useState(null)
  // התנגשויות פתוחות ברמת הספר (מכל העבודות — לא רק האחרונה), ותוצאות מתנגשות שלא נבדקו
  // מעבודות local קודמות (של העבודה האחרונה מוצגות ב-LocalResultIssues)
  const [bookConflictsOpen, setBookConflictsOpen] = useState(0)
  const [olderResultConflicts, setOlderResultConflicts] = useState([])
  const [error, setError] = useState('')

  // הגדרות הטופס
  const [method, setMethod] = useState(GEMINI_DISABLED ? 'ocrwin' : 'gemini')
  const [model, setModel] = useState('gemini-2.5-pro')
  const [existingTextMode, setExistingTextMode] = useState('skip')
  const [splitColumns, setSplitColumns] = useState(false)
  const [localOptions, setLocalOptions] = useState({ ...LOCAL_DEFAULT_OPTIONS })
  const [starting, setStarting] = useState(false)
  const [startNote, setStartNote] = useState('')
  const [cancelling, setCancelling] = useState(false)
  // "המשך הכנה" לעבודת local שנתקעה ב-preparing (ראו canResumePreparation)
  const [resuming, setResuming] = useState(false)
  const [resumeNote, setResumeNote] = useState('')
  // הבקשה האחרונה (התחלה או המשך) נכשלה בתקלה שאפשר להמשיך ממנה (500 preparation_retry וכו')
  const [lastStartNeedsResume, setLastStartNeedsResume] = useState(false)

  const pollRef = useRef(null)
  // requestId של בקשת local: { id, paramsKey } — נשמר לניסיונות החוזרים של אותה בקשה
  const requestRef = useRef(null)
  // ביטול בקשת ה-start של local (והניסיונות החוזרים שלה) בסגירת הדיאלוג
  const startAbortRef = useRef(null)
  useEffect(() => () => startAbortRef.current?.abort(), [])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/books/ocr/status?bookId=${book.id}`)
      const data = await res.json()
      if (data.success) {
        setCounts(data.counts)
        setJob(data.job)
        setWorker(data.worker ?? null)
        // שרת ישן בלי bookConflictsOpen — נופלים לספירה של העבודה האחרונה
        setBookConflictsOpen(Number(data.bookConflictsOpen ?? data.conflictsOpen) || 0)
        setOlderResultConflicts(Array.isArray(data.olderResultConflicts) ? data.olderResultConflicts : [])
      } else {
        setError(data.error || 'שגיאה בטעינת מצב')
      }
    } catch (e) {
      setError('תקלה בתקשורת')
    } finally {
      setLoading(false)
    }
  }, [book.id])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // polling כל עוד יש עבודה פעילה: שרת כל 2.5 שניות, מחשב מקומי כל 10 שניות
  const pollMs = pollIntervalMs(job)
  useEffect(() => {
    if (pollMs) {
      pollRef.current = setInterval(fetchStatus, pollMs)
      return () => clearInterval(pollRef.current)
    }
  }, [pollMs, fetchStatus])

  const isRunning = isJobActive(job)
  const isLocal = method === 'local'
  const localUnavailableInServer = worker?.configured === false

  // ה-requestId קשור לפרמטרים (paramsKey: ספר + טיפול בעמודים ערוכים + אפשרויות): פרמטרים אחרים →
  // requestId חדש (ה-ref וה-sessionStorage נבדקים מול paramsKey). לא מוחקים את השמור בשינוי ספק או
  // פרמטרים: הדיאלוג נפתח תמיד על OCRWin, ומחיקה בבחירת "מחשב מקומי" הייתה מאבדת את ה-requestId
  // של בקשה שנקטעה (timeout / סגירת הדיאלוג) — ולחיצה חוזרת לא הייתה ממשיכה את אותה בקשה.
  const paramsKey = localParamsKey({ bookId: book.id, existingTextMode, options: localOptions })

  const getRequestId = () => {
    if (requestRef.current?.paramsKey === paramsKey) return requestRef.current.id
    const store = sessionStore()
    const id = loadRequestId(store, book.id, paramsKey) || newRequestId()
    requestRef.current = { id, paramsKey }
    saveRequestId(store, book.id, paramsKey, id)
    return id
  }

  const resetRequestId = useCallback(() => {
    requestRef.current = null
    clearRequestId(sessionStore(), book.id)
  }, [book.id])

  // עבודת local פעילה לספר — הבקשה השמורה (אם הייתה) כבר הגיעה לשרת, ובזמן עבודה פעילה אין
  // התחלה חדשה. מוחקים אותה, כדי שהתחלה אחרי סיום העבודה לא תשלח requestId ישן ותקבל
  // "העבודה של הבקשה הזו כבר הסתיימה".
  const activeLocalJob = isRunning && isLocalJob(job)
  useEffect(() => {
    if (activeLocalJob) resetRequestId()
  }, [activeLocalJob, resetRequestId])

  const handleStartLocal = async () => {
    const requestId = getRequestId()
    setStartNote('מכין את קובץ העמודים לעיבוד… בספר גדול זה עשוי להימשך כמה דקות.')
    const controller = new AbortController()
    startAbortRef.current = controller
    const result = await postLocalStart({
      payload: { bookId: book.id, method: 'local', requestId, existingTextMode, options: localOptions },
      delayMs: localRetryDelayMs,
      onRetry: (n, total) => setStartNote(`השרת עדיין לא השיב — מנסה שוב (${n}/${total}) עם אותה בקשה…`),
      signal: controller.signal,
    })
    if (startAbortRef.current === controller) startAbortRef.current = null
    // הדיאלוג נסגר באמצע — לא נוגעים ב-state; ה-requestId נשאר שמור לפתיחה הבאה
    if (result.kind === 'aborted') return
    setStartNote('')
    if (result.kind === 'started') {
      resetRequestId()
      setLastStartNeedsResume(false)
      await fetchStatus()
      return
    }
    if (!result.keepRequestId) resetRequestId()
    setLastStartNeedsResume(!!result.keepRequestId)
    setError(result.message)
    if (result.refresh) await fetchStatus()
  }

  // המשך הכנה של עבודת local שנתקעה ב-preparing: אותה בקשה בדיוק — ה-requestId והפרמטרים מהשרת
  // (ולא מהטופס או מהאחסון המקומי, שאולי כבר נמחקו), כך שהשרת ממשיך את אותה עבודה.
  const handleResumePreparation = async () => {
    if (!job) return
    setResuming(true)
    setError('')
    setResumeNote('ממשיך את הכנת קובץ העמודים… בספר גדול זה עשוי להימשך כמה דקות.')
    const controller = new AbortController()
    startAbortRef.current = controller
    try {
      const result = await postLocalStart({
        payload: resumePreparationPayload(job, book.id),
        delayMs: localRetryDelayMs,
        onRetry: (n, total) => setResumeNote(`השרת עדיין לא השיב — מנסה שוב (${n}/${total}) עם אותה בקשה…`),
        signal: controller.signal,
      })
      if (startAbortRef.current === controller) startAbortRef.current = null
      if (result.kind === 'aborted') return
      if (result.kind === 'started') {
        setLastStartNeedsResume(false)
      } else {
        setLastStartNeedsResume(!!result.keepRequestId)
        setError(result.message)
      }
      await fetchStatus()
    } finally {
      if (!controller.signal.aborted) {
        setResuming(false)
        setResumeNote('')
      }
    }
  }

  const handleStart = async () => {
    setStarting(true)
    setError('')
    try {
      if (isLocal) {
        await handleStartLocal()
        return
      }
      const res = await fetch('/api/admin/books/ocr/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: book.id, method, model, existingTextMode, splitColumns }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchStatus()
      } else {
        setError(data.error || 'שגיאה בהפעלת העבודה')
      }
    } catch (e) {
      setError('תקלה בתקשורת')
    } finally {
      setStarting(false)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    setError('')
    try {
      // local — לפי מזהה העבודה המוצגת (לא "העבודה הפעילה של הספר", שאולי כבר אחרת)
      const target = isLocalJob(job) && job?.id ? { jobId: job.id } : { bookId: book.id }
      const res = await fetch('/api/admin/books/ocr/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // 409 apply_started — "הקליטה כבר החלה": התוצאה כבר נקלטת לעמודים
        setError(data.code === 'apply_started' ? APPLY_STARTED_HE : (data.error || 'ביטול העבודה נכשל'))
      }
      await fetchStatus()
    } catch (e) {
      setError('תקלה בתקשורת')
    } finally {
      setCancelling(false)
    }
  }

  const progress = job && job.totalPages > 0
    ? Math.round((job.processedPages / job.totalPages) * 100)
    : 0

  const willProcess = existingTextMode === 'skip'
    ? Math.max(0, counts.pagesWithImage - counts.editedPagesCount)
    : counts.pagesWithImage

  const lastLocalJob = job && isLocalJob(job) ? job : null
  // פאנל ברמת הספר: גם אחרי עבודה חדשה (OCRWin או local) ההתנגשויות הקודמות נשארות נגישות
  const showConflicts = !isRunning
    && (bookConflictsOpen > 0 || Number(lastLocalJob?.summary?.conflicts) > 0)

  const methodOptions = [
    { id: 'gemini', label: 'Gemini', desc: 'איכות גבוהה (AI)', disabled: GEMINI_DISABLED, disabledNote: 'מושבת זמנית' },
    { id: 'ocrwin', label: 'OCRWin', desc: 'מנוע ייעודי' },
    {
      id: 'local',
      label: 'מחשב מקומי',
      desc: 'OCR תורני במחשב ייעודי; העבודה נכנסת לתור',
      disabled: localUnavailableInServer,
      disabledNote: 'לא מוגדר בשרת',
    },
  ]

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden relative flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b bg-neutral-50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">document_scanner</span>
            <div>
              <h3 className="font-bold text-lg text-neutral-800">OCR לספר שלם</h3>
              <p className="text-xs text-neutral-500 line-clamp-1" title={book.name}>{book.name}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="סגירה" className="text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader size="md" />
            </div>
          ) : isRunning && isLocalJob(job) ? (
            // ===== עבודת מחשב מקומי פעילה =====
            <div className="space-y-4">
              <LocalOcrJobProgress
                job={job}
                worker={worker}
                onCancel={handleCancel}
                cancelling={cancelling}
                canResume={canResumePreparation(job, { lastStartNeedsResume })}
                onResume={handleResumePreparation}
                resuming={resuming}
                resumeNote={resumeNote}
              />
              <LocalResultIssues job={job} onChanged={fetchStatus} />
            </div>
          ) : isRunning ? (
            // ===== תצוגת התקדמות (Gemini / OCRWin) =====
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-info-700 bg-info-50 rounded-lg p-3 text-sm">
                <Loader size="inline" decorative />
                <span>העבודה רצה ברקע. אפשר לסגור את החלון ולחזור מאוחר יותר — העיבוד ימשיך.</span>
              </div>

              <div>
                <div className="flex justify-between text-sm text-neutral-600 mb-1">
                  <span>התקדמות ({job.method === 'gemini' ? `Gemini · ${job.model}` : 'OCRWin'}{job.splitColumns ? ' · 2 טורים' : ''})</span>
                  <span className="font-bold">{progress}%</span>
                </div>
                <div className="w-full bg-neutral-200 rounded-full h-3">
                  <div className="bg-success-500 h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-center mt-2 text-neutral-500">
                  {job.processedPages} מתוך {job.totalPages} עמודים · עמוד נוכחי: {job.currentPageNumber || '—'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <div className="bg-success-50 text-success-700 rounded-lg py-2">
                  <div className="font-bold text-lg">{job.successPages}</div>הצליחו
                </div>
                <div className="bg-danger-50 text-danger-700 rounded-lg py-2">
                  <div className="font-bold text-lg">{job.failedPages}</div>נכשלו
                </div>
              </div>

              <button
                onClick={handleCancel}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-danger-50 text-danger-700 hover:bg-danger-100 rounded-lg font-medium transition-colors"
              >
                <span className="material-symbols-outlined text-sm">stop_circle</span>
                עצור את העבודה
              </button>
            </div>
          ) : (
            // ===== טופס הפעלה =====
            <div className="space-y-5">
              {lastLocalJob && (
                <>
                  <OcrJobSummary job={lastLocalJob} />
                  <LocalResultIssues job={lastLocalJob} onChanged={fetchStatus} />
                </>
              )}

              {job && !lastLocalJob && (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') && (
                <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${
                  job.status === 'completed' ? 'bg-success-50 text-success-700'
                  : job.status === 'cancelled' ? 'bg-warning-50 text-warning-800'
                  : 'bg-danger-50 text-danger-700'
                }`}>
                  <span className="material-symbols-outlined text-base">
                    {job.status === 'completed' ? 'task_alt' : job.status === 'cancelled' ? 'cancel' : 'error'}
                  </span>
                  <span>
                    {job.status === 'completed' && `העבודה האחרונה הסתיימה: ${job.successPages} הצליחו, ${job.failedPages} נכשלו.`}
                    {job.status === 'cancelled' && `העבודה האחרונה בוטלה לאחר ${job.processedPages} עמודים.`}
                    {job.status === 'failed' && `העבודה האחרונה נכשלה: ${job.error || 'שגיאה לא ידועה'}`}
                  </span>
                </div>
              )}

              {showConflicts && <OcrConflictsPanel bookId={book.id} onChanged={fetchStatus} />}
              <OlderResultConflicts items={olderResultConflicts} onChanged={fetchStatus} />

              <div>
                <label className="block text-sm font-bold text-neutral-700 mb-2">שיטת OCR</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {methodOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => !opt.disabled && setMethod(opt.id)}
                      disabled={opt.disabled}
                      aria-pressed={method === opt.id}
                      title={opt.disabled ? opt.disabledNote : undefined}
                      className={`p-3 rounded-lg border text-right transition-all relative ${
                        opt.disabled
                          ? 'border-neutral-200 bg-neutral-50 opacity-60 cursor-not-allowed'
                          : method === opt.id
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <div className="font-bold text-sm text-neutral-800 flex items-center gap-1 flex-wrap">
                        {opt.label}
                        {opt.disabled && (
                          <span className="text-[10px] font-medium text-warning-700 bg-warning-100 px-1.5 py-0.5 rounded-full">
                            {opt.disabledNote}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-500">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {method === 'gemini' && (
                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2">מודל Gemini</label>
                  <select
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-primary outline-none bg-white"
                  >
                    {GEMINI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              )}

              {isLocal ? (
                <>
                  <LocalOcrOptions value={localOptions} onChange={setLocalOptions} disabled={starting} />
                  {worker && worker.configured !== false && worker.availability !== 'online' && (
                    <p className="text-xs text-on-surface-variant">
                      המחשב המקומי לא מחובר כרגע. אפשר להתחיל בכל זאת — העבודה תיכנס לתור ותתחיל כשיחזור.
                    </p>
                  )}
                </>
              ) : (
                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2">פריסת העמוד</label>
                  <label
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      splitColumns ? 'border-primary bg-primary/5' : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={splitColumns}
                      onChange={e => setSplitColumns(e.target.checked)}
                      className="w-4 h-4 text-primary rounded"
                    />
                    <div>
                      <div className="font-medium text-sm text-neutral-800">חיתוך ל-2 טורים (ימין/שמאל)</div>
                      <div className="text-xs text-neutral-500">כל עמוד ייחתך באמצע, כל חצי יישלח ל-OCR בנפרד, והטקסט יאוחד לעמוד אחד</div>
                    </div>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-neutral-700 mb-2">עמודים שכבר ערוכים</label>
                {counts.editedPagesCount > 0 ? (
                  <>
                    <div className="text-sm text-neutral-600 bg-warning-50 border border-warning-100 rounded-lg p-3 mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-warning-600 text-base">info</span>
                      יש <strong>{counts.editedPagesCount}</strong> עמודים שכבר יש בהם טקסט (מתוך {counts.pagesWithImage}).
                    </div>
                    <div className="space-y-2">
                      {[
                        { id: 'skip', label: 'דלג עליהם', desc: 'עיבוד רק עמודים ריקים' },
                        { id: 'overwrite', label: 'דרוס אותם', desc: 'OCR מחדש לכל העמודים, התוכן הקיים יוחלף' },
                      ].map(opt => (
                        <label
                          key={opt.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            existingTextMode === opt.id ? 'border-primary bg-primary/5' : 'border-neutral-200 hover:border-neutral-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="existingTextMode"
                            checked={existingTextMode === opt.id}
                            onChange={() => setExistingTextMode(opt.id)}
                            className="w-4 h-4 text-primary"
                          />
                          <div>
                            <div className="font-medium text-sm text-neutral-800">{opt.label}</div>
                            <div className="text-xs text-neutral-500">{opt.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-neutral-500 bg-neutral-50 rounded-lg p-3">
                    אין עמודים ערוכים — כל {counts.pagesWithImage} העמודים יעובדו.
                  </p>
                )}
              </div>

              <div className="text-sm text-center text-neutral-600 bg-neutral-50 rounded-lg py-2">
                יעובדו <strong className="text-primary">{willProcess}</strong> עמודים
              </div>

              {error && (
                <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-lg p-3">{error}</div>
              )}

              {starting && startNote && (
                <p role="status" className="text-xs text-center text-neutral-500">{startNote}</p>
              )}

              <button
                onClick={handleStart}
                disabled={starting || willProcess === 0 || (isLocal && localUnavailableInServer)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-on-primary rounded-xl hover:bg-accent font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {starting ? (
                  <Loader size="inline" decorative />
                ) : (
                  <>
                    <span className="material-symbols-outlined">play_arrow</span>
                    {isLocal ? `שלח לתור ${willProcess} עמודים` : `התחל OCR ל-${willProcess} עמודים`}
                  </>
                )}
              </button>
            </div>
          )}

          {error && isRunning && (
            <div role="alert" className="text-sm text-danger-600 bg-danger-50 rounded-lg p-3 mt-3">{error}</div>
          )}
        </div>
      </div>
    </div>
  )
}
