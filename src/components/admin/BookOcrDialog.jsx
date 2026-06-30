'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (מהיר וזול)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (מדויק)' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (החדש ביותר)' },
]

const ACTIVE = 'running'

// השבתה זמנית של Gemini (תואם לחסימה בצד השרת ב-/api/admin/books/ocr/start)
const GEMINI_DISABLED = true

export default function BookOcrDialog({ book, onClose }) {
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({ pagesWithImage: 0, editedPagesCount: 0 })
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')

  // הגדרות הטופס
  const [method, setMethod] = useState(GEMINI_DISABLED ? 'ocrwin' : 'gemini')
  const [model, setModel] = useState('gemini-2.5-pro')
  const [existingTextMode, setExistingTextMode] = useState('skip')
  const [splitColumns, setSplitColumns] = useState(false)
  const [starting, setStarting] = useState(false)

  const pollRef = useRef(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/books/ocr/status?bookId=${book.id}`)
      const data = await res.json()
      if (data.success) {
        setCounts(data.counts)
        setJob(data.job)
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

  // polling כל עוד יש עבודה פעילה
  useEffect(() => {
    if (job?.status === ACTIVE) {
      pollRef.current = setInterval(fetchStatus, 2500)
      return () => clearInterval(pollRef.current)
    }
  }, [job?.status, fetchStatus])

  const isRunning = job?.status === ACTIVE

  const handleStart = async () => {
    setStarting(true)
    setError('')
    try {
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
    try {
      await fetch('/api/admin/books/ocr/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: book.id }),
      })
      await fetchStatus()
    } catch (e) {
      setError('תקלה בתקשורת')
    }
  }

  const progress = job && job.totalPages > 0
    ? Math.round((job.processedPages / job.totalPages) * 100)
    : 0

  const willProcess = existingTextMode === 'skip'
    ? Math.max(0, counts.pagesWithImage - counts.editedPagesCount)
    : counts.pagesWithImage

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
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex justify-center py-10 text-primary">
              <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
            </div>
          ) : isRunning ? (
            // ===== תצוגת התקדמות =====
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-info-700 bg-info-50 rounded-lg p-3 text-sm">
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
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
              {job && (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') && (
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

              <div>
                <label className="block text-sm font-bold text-neutral-700 mb-2">שיטת OCR</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'gemini', label: 'Gemini', desc: 'איכות גבוהה (AI)', disabled: GEMINI_DISABLED },
                    { id: 'ocrwin', label: 'OCRWin', desc: 'מנוע ייעודי' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => !opt.disabled && setMethod(opt.id)}
                      disabled={opt.disabled}
                      title={opt.disabled ? 'מושבת זמנית' : undefined}
                      className={`p-3 rounded-lg border text-right transition-all relative ${
                        opt.disabled
                          ? 'border-neutral-200 bg-neutral-50 opacity-60 cursor-not-allowed'
                          : method === opt.id
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <div className="font-bold text-sm text-neutral-800 flex items-center gap-1">
                        {opt.label}
                        {opt.disabled && (
                          <span className="text-[10px] font-medium text-warning-700 bg-warning-100 px-1.5 py-0.5 rounded-full">
                            מושבת זמנית
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
                <div className="text-sm text-danger-600 bg-danger-50 rounded-lg p-3">{error}</div>
              )}

              <button
                onClick={handleStart}
                disabled={starting || willProcess === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-on-primary rounded-xl hover:bg-accent font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {starting ? (
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                ) : (
                  <>
                    <span className="material-symbols-outlined">play_arrow</span>
                    התחל OCR ל-{willProcess} עמודים
                  </>
                )}
              </button>
            </div>
          )}

          {error && isRunning && (
            <div className="text-sm text-danger-600 bg-danger-50 rounded-lg p-3 mt-3">{error}</div>
          )}
        </div>
      </div>
    </div>
  )
}
