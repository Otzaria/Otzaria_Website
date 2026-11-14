'use client'

import { useEffect, useRef, useState } from 'react'
import { errorText } from '@/lib/corrections/error-text'

const btn = 'px-3 py-2 rounded-lg font-medium text-sm disabled:opacity-50 flex items-center gap-1'
const PATH_CHECK_DELAY_MS = 500

/**
 * בחירת מקור ידנית: נתיב + מספר שורה → טעינת השורה מהמאגר.
 * הנתיב נבדק כבר בזמן ההקלדה (לפני מספר השורה), והשגיאות מוצגות כאן, ליד השדות.
 * @param {{
 *   busy:boolean,
 *   run:(body:object, opts?:object)=>Promise<any>,
 *   probe?:(body:object)=>Promise<{ok:boolean, data:object}>,
 *   pick?:{path:string, lineIndex:(number|null), key:number}|null,
 *   knownPath?:string|null,
 *   preview:object|null,
 *   onPreview:(preview:object|null)=>void,
 *   onEdit:()=>void,
 * }} props
 *   probe — בדיקה שקטה (בלי busy), לבדיקת הנתיב בזמן ההקלדה.
 *   pick — מועמד שנבחר מרשימת המועמדים: ממלא את השדות וטוען את השורה (מועמד חדש = רכיב חדש, לפי key).
 *   knownPath — קובץ הספר שאותר במאגר (גם כשהשורה עצמה לא נמצאה): נבחר מראש, ונשאר רק לבחור שורה.
 */
export default function ManualSourcePicker({ busy, run, probe, pick, knownPath = null, preview, onPreview, onEdit }) {
  const initialPath = pick?.path || knownPath || ''
  const [path, setPath] = useState(initialPath)
  // ספר שנבחר מראש מוצג כקבוע; שינוי שלו הוא אפשרות, לא חובה
  const [editingPath, setEditingPath] = useState(!initialPath)
  const [line, setLine] = useState(Number.isInteger(pick?.lineIndex) ? String(pick.lineIndex + 1) : '')
  const [pathCheck, setPathCheck] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const pathInput = useRef(null)
  const lineInput = useRef(null)

  const trimmedPath = path.trim()
  const lineNumber = Number(line)
  const lineValid = Number.isInteger(lineNumber) && lineNumber >= 1
  const pathOk = pathCheck?.path === trimmedPath && pathCheck.ok
  const pathError = pathCheck?.path === trimmedPath && !pathCheck.ok ? pathCheck.text : null
  const lineTooBig = pathOk && lineValid && lineNumber > pathCheck.lineCount

  const showResult = (res) => {
    if (res && res.line !== undefined) {
      setLoadError(null)
      onPreview(res)
    } else {
      onPreview(null)
      setLoadError(res?.errorText || 'טעינת השורה נכשלה')
    }
  }
  const fetchLine = (p, n) => run({ action: 'preview_source', path: p, lineIndex: n - 1 }, { keep: true, quiet: true })

  // פתיחה: הסמן בשדה הנתיב (או בשדה השורה כשהנתיב כבר מולא); מועמד עם מספר שורה — נטען מיד
  useEffect(() => {
    ;(initialPath ? lineInput : pathInput).current?.focus()
    if (pick?.path && Number.isInteger(pick.lineIndex)) fetchLine(pick.path, pick.lineIndex + 1).then(showResult)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // בדיקת הנתיב אחרי הפסקה בהקלדה — שגיאה בשם הספר מוצגת עוד לפני מספר השורה
  useEffect(() => {
    if (!probe || !trimmedPath) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const { ok, data } = await probe({ action: 'check_source_path', path: trimmedPath })
        if (cancelled) return
        setPathCheck(ok
          ? { path: trimmedPath, ok: true, lineCount: data.lineCount }
          : { path: trimmedPath, ok: false, text: errorText(data, 'בדיקת הנתיב נכשלה') })
      } catch {
        if (!cancelled) setPathCheck(null)
      }
    }, PATH_CHECK_DELAY_MS)
    return () => { cancelled = true; clearTimeout(t) }
  }, [probe, trimmedPath])

  const changeBook = () => {
    setEditingPath(true)
    requestAnimationFrame(() => { pathInput.current?.focus(); pathInput.current?.select() })
  }

  const onSubmit = (e) => {
    e.preventDefault()
    if (!busy && trimmedPath && lineValid && !pathError && !lineTooBig) fetchLine(trimmedPath, lineNumber).then(showResult)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-on-surface/60">
        {editingPath
          ? <>נתיב Git מלא במאגר (תחת &lt;תיקייה&gt;/ספרים/אוצריא/) ומספר שורה (1 = ראשונה).</>
          : <>הספר נמצא במאגר — נשאר לבחור את מספר השורה (1 = ראשונה).</>}
        {' '}הבחירה מתועדת; האישור עצמו נעשה דרך &quot;עריכה ואז אישור&quot;.
      </p>
      {!editingPath && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-on-surface/70">ספר:</span>
          <span dir="ltr" className="font-mono text-xs bg-surface-variant rounded px-2 py-1 break-all">{trimmedPath}</span>
          <button type="button" onClick={changeBook} className="text-xs text-primary underline">שינוי ספר</button>
        </div>
      )}
      <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
        <input
          ref={pathInput}
          hidden={!editingPath}
          value={path}
          onChange={(e) => { setPath(e.target.value); setLoadError(null) }}
          placeholder="ToratEmetToOtzaria/ספרים/אוצריא/…txt"
          aria-invalid={Boolean(pathError)}
          className={`flex-1 min-w-[18rem] border rounded-lg px-2 py-1 bg-white ${pathError ? 'border-danger-400' : ''}`}
        />
        <input
          ref={lineInput}
          value={line}
          onChange={(e) => { setLine(e.target.value); setLoadError(null) }}
          placeholder="שורה"
          inputMode="numeric"
          aria-invalid={lineTooBig}
          className={`w-24 border rounded-lg px-2 py-1 bg-white ${lineTooBig ? 'border-danger-400' : ''}`}
        />
        <button type="submit" disabled={busy || !trimmedPath || !lineValid || Boolean(pathError) || lineTooBig} className={`${btn} glass`}>
          טעינת השורה
        </button>
      </form>

      {/* מצב הנתיב והשגיאות — כאן, ליד השדות, ולא בראש הדף */}
      {pathError && <p role="alert" className="text-sm text-danger-700">{pathError}</p>}
      {pathOk && !lineTooBig && <p className="text-xs text-success-700">הקובץ נמצא ({pathCheck.lineCount} שורות).</p>}
      {lineTooBig && <p role="alert" className="text-sm text-danger-700">{errorText({ error: 'line_out_of_range', lineCount: pathCheck.lineCount })}</p>}
      {loadError && <p role="alert" className="text-sm text-danger-700">{loadError}</p>}

      {preview && (
        <div className="rounded-lg border border-info-200 bg-white p-3 text-sm space-y-1">
          {preview.neighbors.map((n) => (
            <div key={n.lineIndex} className={`whitespace-pre-wrap break-words ${n.lineIndex === preview.lineIndex ? 'font-bold bg-info-50' : 'text-on-surface/60'}`}>
              <span className="text-xs text-on-surface/40 ml-2">{n.lineIndex + 1}</span>{n.text}
            </div>
          ))}
          <button onClick={onEdit} className={`${btn} bg-primary text-on-primary mt-2`}>עריכת השורה הזו ואישור</button>
        </div>
      )}
    </div>
  )
}
