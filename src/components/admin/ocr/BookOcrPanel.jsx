'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Loader from '@/components/ui/Loader'
import Button from '@/components/ui/Button'
import ErrorState from '@/components/ui/ErrorState'
import ProgressBar from '@/components/ui/ProgressBar'
import SelectMenu from '@/components/ui/SelectMenu'
import PageRangeFields from '@/components/ui/PageRangeFields'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { CHECKBOX, FIELD_LABEL } from '@/components/ui/fieldStyles'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { loginHref, requestJson } from '@/components/admin/list/adminRequest'
import LocalOcrOptions from '@/components/admin/ocr/LocalOcrOptions'
import LocalOcrJobProgress from '@/components/admin/ocr/LocalOcrJobProgress'
import OcrJobSummary from '@/components/admin/ocr/OcrJobSummary'
import OcrConflictsPanel from '@/components/admin/ocr/OcrConflictsPanel'
import LocalResultIssues from '@/components/admin/ocr/LocalResultIssues'
import OlderResultConflicts from '@/components/admin/ocr/OlderResultConflicts'
import { pageRangeText, parsePageRangeInput } from '@/lib/pageRange'
import {
  EXISTING_TEXT_OPTIONS,
  LOCAL_DEFAULT_OPTIONS,
  canResumePreparation,
  isJobActive,
  isLocalJob,
  jobRangeText,
  methodLabel,
  pollIntervalMs,
  resumePreparationPayload,
  willProcessCount,
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

// הערכים נשלחים לשרת כמו שהם; לעין — רק מה שההבדל אומר למשתמש
const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'מהיר' },
  { value: 'gemini-2.5-pro', label: 'מדויק' },
  { value: 'gemini-3-pro-preview', label: 'החדש ביותר (בניסיון)' },
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
 * זיהוי טקסט אוטומטי (OCR) לספר שלם — הלוח עצמו, בלי עטיפה: מוצג בלשונית "זיהוי טקסט אוטומטי"
 * במגירת הספר (admin/books/BookDrawer). הלוגיקה כמו שהייתה ב-BookOcrDialog — רק העטיפה הוחלפה.
 * שלושה ספקים: Gemini (מושבת זמנית), OCRWin (שניהם רצים בשרת),
 * ומחשב מקומי (method=local: העבודה ממתינה למחשב ומעובדת בשירות OtzariaTaskAgent).
 * לעין — שמות פשוטים ("בינה מלאכותית", "מנוע זיהוי ייעודי", "מחשב מקומי"); הערכים לשרת לא השתנו.
 * שיטה שאינה זמינה (מושבתת / לא מוגדרת בשרת) — לא מוצגת בכלל; כשתיפתח, תופיע מעצמה.
 * הבקשות (מצב, התחלה בשרת, עצירה) — דרך admin/list/adminRequest: התחברות שפגה מוצגת כ"פג תוקף
 * ההתחברות" עם קישור להתחברות, והבדיקה החוזרת נעצרת. "עצור" — אחרי אישור, ובלי בקשה כפולה.
 * לוגיקת התצוגה הטהורה — src/components/admin/ocr/ocrJobView.js; התחלת local עם requestId
 * וניסיונות חוזרים — src/components/admin/ocr/localStart.js.
 *
 * טווח עמודים ("מעמוד / עד עמוד", לכל הספקים): ריק = כל הספר, ואז הבקשות זהות לגמרי למה שהיו
 * (בלי pageRange). "יעובדו N עמודים" לטווח נספר מרצפי העמודים שהשרת מחזיר (counts.toProcessRuns),
 * ו"עד עמוד" נבדק מול מספר העמוד הגבוה בספר (counts.maxPageNumber; בגיבוי book.totalPages).
 *
 * localRetryDelayMs — ההמתנה בין ניסיונות חוזרים של בקשת local (ניתן לשינוי לטסטים).
 */
export default function BookOcrPanel({ book, localRetryDelayMs = START_RETRY_DELAY_MS }) {
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({ pagesWithImage: 0, editedPagesCount: 0 })
  const [job, setJob] = useState(null)
  const [worker, setWorker] = useState(null)
  // התנגשויות פתוחות ברמת הספר (מכל העבודות — לא רק האחרונה), ותוצאות מתנגשות שלא נבדקו
  // מעבודות local קודמות (של העבודה האחרונה מוצגות ב-LocalResultIssues)
  const [bookConflictsOpen, setBookConflictsOpen] = useState(0)
  const [olderResultConflicts, setOlderResultConflicts] = useState([])
  const [error, setError] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [confirm, confirmElement] = useConfirm()

  // הגדרות הטופס
  const [method, setMethod] = useState(GEMINI_DISABLED ? 'ocrwin' : 'gemini')
  const [model, setModel] = useState('gemini-2.5-pro')
  const [existingTextMode, setExistingTextMode] = useState('skip')
  const [splitColumns, setSplitColumns] = useState(false)
  const [localOptions, setLocalOptions] = useState({ ...LOCAL_DEFAULT_OPTIONS })
  // טווח העמודים כמו שהוקלד (מחרוזות); הפירוש — parsePageRangeInput למטה
  const [rangeInput, setRangeInput] = useState({ from: '', to: '' })
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
      const data = await requestJson(`/api/admin/books/ocr/status?bookId=${encodeURIComponent(book.id)}`, { fallback: 'לא הצלחנו לטעון את מצב הזיהוי.' })
      setCounts(data.counts)
      setJob(data.job)
      setWorker(data.worker ?? null)
      // שרת ישן בלי bookConflictsOpen — נופלים לספירה של העבודה האחרונה
      setBookConflictsOpen(Number(data.bookConflictsOpen ?? data.conflictsOpen) || 0)
      setOlderResultConflicts(Array.isArray(data.olderResultConflicts) ? data.olderResultConflicts : [])
    } catch (e) {
      if (e?.sessionExpired) setSessionExpired(true)
      else setError(e?.message || 'לא הצלחנו לטעון את מצב הזיהוי.')
    } finally {
      setLoading(false)
    }
  }, [book.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינה מהשרת; ה-setState קורה אחרי await
    fetchStatus()
  }, [fetchStatus])

  // polling כל עוד יש עבודה פעילה: שרת כל 2.5 שניות, מחשב מקומי כל 10 שניות
  const pollMs = sessionExpired ? null : pollIntervalMs(job)
  useEffect(() => {
    if (pollMs) {
      pollRef.current = setInterval(fetchStatus, pollMs)
      return () => clearInterval(pollRef.current)
    }
  }, [pollMs, fetchStatus])

  const isRunning = isJobActive(job)
  const isLocal = method === 'local'
  const localUnavailableInServer = worker?.configured === false

  // טווח העמודים: null = כל הספר; טווח לא תקין חוסם את ההתחלה (וההודעה מוצגת מתחת לשדות)
  const pageTotal = Number(counts.maxPageNumber) || Number(book.totalPages) || undefined
  const parsedRange = parsePageRangeInput(rangeInput, { total: pageTotal })
  const pageRange = parsedRange.ok ? parsedRange.range : null
  const rangeInvalid = !parsedRange.ok
  const rangeBody = pageRange ? { pageRange } : {}

  // ה-requestId קשור לפרמטרים (paramsKey: ספר + טיפול בעמודים ערוכים + אפשרויות + טווח): פרמטרים אחרים →
  // requestId חדש (ה-ref וה-sessionStorage נבדקים מול paramsKey). לא מוחקים את השמור בשינוי ספק או
  // פרמטרים: הדיאלוג נפתח תמיד על OCRWin, ומחיקה בבחירת "מחשב מקומי" הייתה מאבדת את ה-requestId
  // של בקשה שנקטעה (timeout / סגירת הדיאלוג) — ולחיצה חוזרת לא הייתה ממשיכה את אותה בקשה.
  const paramsKey = localParamsKey({ bookId: book.id, existingTextMode, options: localOptions, pageRange })

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
      payload: { bookId: book.id, method: 'local', requestId, existingTextMode, options: localOptions, ...rangeBody },
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
    if (rangeInvalid) return
    setStarting(true)
    setError('')
    try {
      if (isLocal) {
        await handleStartLocal()
        return
      }
      await requestJson('/api/admin/books/ocr/start', {
        method: 'POST',
        body: { bookId: book.id, method, model, existingTextMode, splitColumns, ...rangeBody },
        fallback: 'לא הצלחנו להתחיל את הזיהוי.',
      })
      await fetchStatus()
    } catch (e) {
      if (e?.sessionExpired) setSessionExpired(true)
      else setError(e?.message || 'לא הצלחנו להתחיל את הזיהוי.')
    } finally {
      setStarting(false)
    }
  }

  const cancellingRef = useRef(false)
  const handleCancel = async () => {
    // לחיצה כפולה — בקשת עצירה אחת
    if (cancellingRef.current) return
    cancellingRef.current = true
    setCancelling(true)
    setError('')
    try {
      // local — לפי מזהה העבודה המוצגת (לא "העבודה הפעילה של הספר", שאולי כבר אחרת)
      const target = isLocalJob(job) && job?.id ? { jobId: job.id } : { bookId: book.id }
      await requestJson('/api/admin/books/ocr/cancel', { method: 'POST', body: target, fallback: 'לא הצלחנו לעצור את העבודה.' })
    } catch (e) {
      if (e?.sessionExpired) setSessionExpired(true)
      // 409 apply_started — "הקליטה כבר החלה": התוצאה כבר נקלטת לעמודים
      else setError(e?.code === 'apply_started' ? APPLY_STARTED_HE : (e?.message || 'לא הצלחנו לעצור את העבודה.'))
    }
    await fetchStatus()
    cancellingRef.current = false
    setCancelling(false)
  }

  // עצירה של עבודה בשרת — אחרי אישור (עמודים שכבר זוהו נשארים)
  const confirmStop = async () => {
    if (cancellingRef.current) return
    const ok = await confirm({
      title: 'לעצור את הזיהוי?',
      body: 'עמודים שכבר זוהו יישארו כמו שהם. שאר העמודים לא יעובדו.',
      confirmLabel: 'עצור',
      cancelLabel: 'המשך לזהות',
      tone: 'danger',
    })
    if (ok) await handleCancel()
  }

  const progress = job && job.totalPages > 0
    ? Math.round((job.processedPages / job.totalPages) * 100)
    : 0
  const progressId = `ocr-progress-${book.id}`

  const willProcess = willProcessCount(counts, existingTextMode, pageRange)
  const runningRange = jobRangeText(job)

  const lastLocalJob = job && isLocalJob(job) ? job : null
  // פאנל ברמת הספר: גם אחרי עבודה חדשה (OCRWin או local) ההתנגשויות הקודמות נשארות נגישות
  const showConflicts = !isRunning
    && (bookConflictsOpen > 0 || Number(lastLocalJob?.summary?.conflicts) > 0)

  // רק השיטות הזמינות עכשיו (החלטת המשתמש): שיטה מושבתת או לא מוגדרת בשרת — לא מוצגת
  const methodOptions = [
    { id: 'gemini', label: 'בינה מלאכותית', desc: 'איכות גבוהה', disabled: GEMINI_DISABLED },
    { id: 'ocrwin', label: 'מנוע זיהוי ייעודי', desc: 'רץ בשרת, ומתחיל מיד' },
    { id: 'local', label: 'מחשב מקומי', desc: 'מותאם לספרים תורניים. מתחיל כשהמחשב פנוי', disabled: localUnavailableInServer },
  ].filter((opt) => !opt.disabled)
  const methodGrid = methodOptions.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'

  if (sessionExpired) {
    return (
      <ErrorState
        title="פג תוקף ההתחברות"
        description="התחבר מחדש כדי לראות את מצב הזיהוי. אחרי ההתחברות תחזור לכאן."
        action={<Button href={loginHref()} variant="filled" size="sm" icon="login">התחבר</Button>}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {confirmElement}
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
          <div className="flex items-center gap-2 rounded-(--radius-control) bg-info-container p-3 text-body-sm text-on-info-container">
            <Loader size="inline" decorative />
            <span>הזיהוי רץ ברקע. אפשר לסגור את המגירה ולחזור מאוחר יותר — העיבוד ימשיך.</span>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-body-sm text-on-surface-variant">
              <span id={progressId}>התקדמות ({job.method === 'gemini' ? 'בינה מלאכותית' : methodLabel(job)}{job.splitColumns ? ' · שני טורים' : ''}{runningRange ? ` · ${runningRange}` : ''})</span>
              <span className="tabular-nums text-on-surface">{progress}%</span>
            </div>
            <ProgressBar
              value={job.processedPages}
              max={job.totalPages}
              labelledBy={progressId}
              valueText={`${job.processedPages} מתוך ${job.totalPages} עמודים`}
              size="md"
            />
            <p className="mt-2 text-center text-body-sm tabular-nums text-on-surface-variant">
              {job.processedPages} מתוך {job.totalPages} עמודים · עמוד נוכחי: {job.currentPageNumber || '—'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center text-body-sm">
            <div className="rounded-(--radius-control) bg-success-container py-2 text-on-success-container">
              <div className="text-title-md tabular-nums">{job.successPages}</div>הצליחו
            </div>
            <div className="rounded-(--radius-control) bg-error-container py-2 text-on-error-container">
              <div className="text-title-md tabular-nums">{job.failedPages}</div>נכשלו
            </div>
          </div>

          <Button variant="outlined" size="sm" icon="stop_circle" fullWidth onClick={confirmStop} loading={cancelling}>
            {cancelling ? 'עוצר…' : 'עצור את הזיהוי'}
          </Button>
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
            <div className={`flex items-start gap-2 rounded-(--radius-control) p-3 text-body-sm ${
              job.status === 'completed' ? 'bg-success-container text-on-success-container'
              : job.status === 'cancelled' ? 'bg-warning-container text-on-warning-container'
              : 'bg-error-container text-on-error-container'
            }`}>
              <span aria-hidden="true" className="material-symbols-outlined text-icon-sm">
                {job.status === 'completed' ? 'task_alt' : job.status === 'cancelled' ? 'cancel' : 'error'}
              </span>
              <span>
                {job.status === 'completed' && `העבודה האחרונה הסתיימה: ${job.successPages} הצליחו, ${job.failedPages} נכשלו.`}
                {job.status === 'cancelled' && `העבודה האחרונה בוטלה לאחר ${job.processedPages} עמודים.`}
                {job.status === 'failed' && `העבודה האחרונה נכשלה: ${job.error || 'שגיאה לא ידועה'}`}
                {runningRange && ` (${runningRange})`}
              </span>
            </div>
          )}

          {showConflicts && <OcrConflictsPanel bookId={book.id} onChanged={fetchStatus} />}
          <OlderResultConflicts items={olderResultConflicts} onChanged={fetchStatus} />

          <div>
            <p className={FIELD_LABEL}>איך לזהות את הטקסט</p>
            {methodOptions.length === 1 ? (
              <p className="rounded-(--radius-control) bg-surface p-3 text-body-sm text-on-surface-variant">
                <span className="text-on-surface">{methodOptions[0].label}</span> — {methodOptions[0].desc}
              </p>
            ) : (
              <div className={`grid grid-cols-1 gap-2 ${methodGrid}`}>
                {methodOptions.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMethod(opt.id)}
                    aria-pressed={method === opt.id}
                    className={`relative rounded-(--radius-control) border p-3 text-start transition-colors ${FOCUS_RING} ${
                      method === opt.id
                        ? 'border-primary bg-surface-selected ring-1 ring-primary'
                        : 'border-outline-variant bg-surface hover:bg-surface-selected'
                    }`}
                  >
                    <div className="text-label-lg text-on-surface">{opt.label}</div>
                    <div className="text-body-sm text-on-surface-variant">{opt.desc}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {method === 'gemini' && (
            <SelectMenu label="רמת הדיוק" options={GEMINI_MODELS} value={model} onChange={setModel} searchable={false} />
          )}

          {isLocal ? (
            <>
              <LocalOcrOptions value={localOptions} onChange={setLocalOptions} disabled={starting} />
              {worker && worker.configured !== false && worker.availability !== 'online' && (
                <p className="text-body-sm text-on-surface-variant">
                  המחשב המקומי לא מחובר כרגע. אפשר להתחיל בכל זאת — העבודה תחכה ותתחיל כשהמחשב יחזור.
                </p>
              )}
            </>
          ) : (
            <div>
              <p className={FIELD_LABEL}>פריסת העמוד</p>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-(--radius-control) border p-3 transition-colors ${
                  splitColumns ? 'border-primary bg-surface-selected' : 'border-outline-variant bg-surface hover:bg-surface-selected'
                }`}
              >
                <input
                  type="checkbox"
                  checked={splitColumns}
                  onChange={e => setSplitColumns(e.target.checked)}
                  className={CHECKBOX}
                />
                <div>
                  <div className="text-label-lg text-on-surface">העמוד בנוי משני טורים</div>
                  <div className="text-body-sm text-on-surface-variant">כל עמוד ייחתך באמצע, כל טור יזוהה בנפרד, והטקסט יאוחד לעמוד אחד</div>
                </div>
              </label>
            </div>
          )}

          <div>
            <p className={FIELD_LABEL}>עמודים שכבר ערוכים</p>
            {counts.editedPagesCount > 0 ? (
              <>
                <div className="mb-3 flex items-center gap-2 rounded-(--radius-control) bg-warning-container p-3 text-body-sm text-on-warning-container">
                  <span aria-hidden="true" className="material-symbols-outlined text-icon-sm">info</span>
                  <span>
                    יש {counts.editedPagesCount} עמודים שכבר יש בהם טקסט (מתוך {counts.pagesWithImage})
                    {Number.isFinite(counts.humanEditedPagesCount) && (
                      <>; מתוכם {counts.humanEditedPagesCount} נערכו או נתפסו בידי מתנדבים</>
                    )}.
                  </span>
                </div>
                <div className="space-y-2">
                  {EXISTING_TEXT_OPTIONS.map(opt => (
                    <label
                      key={opt.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-(--radius-control) border p-3 transition-colors ${
                        existingTextMode === opt.id ? 'border-primary bg-surface-selected' : 'border-outline-variant bg-surface hover:bg-surface-selected'
                      }`}
                    >
                      <input
                        type="radio"
                        name="existingTextMode"
                        checked={existingTextMode === opt.id}
                        onChange={() => setExistingTextMode(opt.id)}
                        className="size-5 shrink-0 cursor-pointer accent-primary"
                      />
                      <div>
                        <div className="text-label-lg text-on-surface">{opt.label}</div>
                        <div className="text-body-sm text-on-surface-variant">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className="rounded-(--radius-control) bg-surface-container-low p-3 text-body-sm text-on-surface-variant">
                {pageRange ? 'אין עמודים ערוכים בספר.' : <>אין עמודים ערוכים — כל {counts.pagesWithImage} העמודים יעובדו.</>}
              </p>
            )}
          </div>

          <PageRangeFields
            legend="אילו עמודים לזהות"
            value={rangeInput}
            onChange={setRangeInput}
            total={pageTotal}
            disabled={starting}
            error={rangeInvalid ? parsedRange.error : undefined}
            errorField={rangeInvalid ? parsedRange.field : undefined}
            hint={pageRange && willProcess === 0
              ? 'אין בטווח הזה עמודים לעיבוד במצב שנבחר.'
              : 'ריק = כל הספר.'}
          />

          <div className="rounded-(--radius-control) bg-surface-container-low py-2 text-center text-body-sm text-on-surface-variant">
            יעובדו <span className="text-on-surface tabular-nums">{willProcess}</span> עמודים
            {pageRange && <> ({pageRangeText(pageRange)})</>}
          </div>

          {error && (
            <div role="alert" className="rounded-(--radius-control) bg-error-container p-3 text-body-sm text-on-error-container">{error}</div>
          )}

          {starting && startNote && (
            <p role="status" className="text-center text-body-sm text-on-surface-variant">{startNote}</p>
          )}

          <Button
            variant="filled"
            icon="play_arrow"
            fullWidth
            onClick={handleStart}
            loading={starting}
            disabled={willProcess === 0 || rangeInvalid || (isLocal && localUnavailableInServer)}
          >
            {isLocal ? `שלח ${willProcess} עמודים לזיהוי` : `התחל זיהוי ב-${willProcess} עמודים`}
          </Button>
        </div>
      )}

      {error && isRunning && (
        <div role="alert" className="rounded-(--radius-control) bg-error-container p-3 text-body-sm text-on-error-container">{error}</div>
      )}
    </div>
  )
}
