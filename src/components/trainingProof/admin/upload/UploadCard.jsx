'use client'

import { useEffect, useRef, useState } from 'react'
import { SECTION_LABELS, SCRIPT_LABELS, MAX_FILE_BYTES } from '@/lib/trainingProof/vocab'
import { sendForm, sendJson, fmt } from '../api'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import ProgressBar from '@/components/ui/ProgressBar'
import { cx } from '@/components/ui/cx'
import { Card, Muted, SECTION_ICONS } from '../bits'

// כרטיס העלאה לחלק אחד: גרירת קובצי ZIP (או בחירה) — אפשר כמה יחד, כי התחנה מפצלת חבילה
// גדולה לכמה קבצים; הם נקלטים בזה אחר זה לפי סדר השמות (חלק 1, 2, …), וכל קובץ מקבל שורת
// מצב משלו. אין בחירת מסלול (ה-12) — כל פריט בקובץ נושא את הספר והמסלול שלו. הבדיקה
// בשרת (zipCheck) קודם; קובץ של חלק אחר ← הודעה ברורה, והקבצים האחרים ממשיכים. אחר-כך
// הקליטה במנות קטנות (כל מנה בקשה משלה), כדי שהשער של האתר לא יחזיר 504 באמצע; אפשר
// לעצור, ומה שנקלט נשאר.

const HINTS = {
  ocr: 'שורות עם תמונה וטקסט-המודל, מכל הכתבים. השורות יוצגו למתנדבים מעורבבות.',
  router: 'שורות עם הצעת הנתב לשורה ולכל מילה.',
  frames: 'עמודים שלמים עם הצעת המודל למסגרות, מקובצים לפי ספר.',
}

// "מה נקרא מהקובץ" בשורה אחת
export function readText(section, read) {
  if (!read) return ''
  if (section === 'frames' && read.books) return `${fmt(read.books.length)} ספרים · ${fmt(read.items)} עמ' (${read.books.map((b) => `${b.alias}: ${b.pages}`).join(' · ')})`
  const parts = Object.entries(read.byTrack || read.by_track || {}).map(([k, v]) => `${SCRIPT_LABELS[k] || (k === 'none' ? 'בלי הצעה' : k)} ${fmt(v)}`)
  const lead = section === 'router' ? 'הצעת הנתב: ' : ''
  return `${fmt(read.items)} ${section === 'frames' ? "עמ'" : 'שורות'}${parts.length ? ` · ${lead}${parts.join(' · ')}` : ''}`
}

// סדר הקבצים: לפי השם, עם מספרים כמספרים (router-2 לפני router-10)
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })

export default function UploadCard({ section, onDone }) {
  const input = useRef(null)
  const stop = useRef(false)
  const alive = useRef(true)
  const [hot, setHot] = useState(false)
  const [busy, setBusy] = useState(false)
  const [list, setList] = useState([]) // לכל קובץ: {phase, name, staged, progress, error, errors, wrong}

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      stop.current = true
    }
  }, [])

  const put = (i, patch) => {
    if (alive.current) setList((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  }

  // קובץ אחד: בדיקה בשרת, ואז מנה אחרי מנה. מחזיר האם ייתכן שהנתונים השתנו.
  const one = async (file, i) => {
    if (!/\.zip$/i.test(file.name)) {
      put(i, { phase: 'error', error: 'יש להעלות קובץ ZIP מתחנת-האימון' })
      return false
    }
    if (file.size > MAX_FILE_BYTES) {
      put(i, { phase: 'error', error: `הקובץ גדול מ-${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB — התחנה מפצלת לכמה קבצים` })
      return false
    }
    put(i, { phase: 'check' })
    const fd = new FormData()
    fd.append('section', section)
    fd.append('file', file)
    let staged
    try {
      staged = await sendForm('/upload', fd)
    } catch (e) {
      put(i, { phase: 'error', error: e.message, errors: e.data?.errors, wrong: e.data?.wrongSection })
      // דחיית הרשאה/קובץ נעשית לפני כתיבה. תקלה בשרת או ברשת יכולה לקרות אחרי יצירת חבילה.
      return ![400, 401, 403, 413].includes(e.status)
    }
    let progress = { done: 0, total: staged.total, inserted: 0, skipped: 0 }
    put(i, { phase: 'ingest', staged, progress })
    let tries = 0
    while (!stop.current) {
      try {
        const r = await sendJson(`/upload/${staged.token}`, undefined)
        tries = 0
        progress = r
        put(i, { progress: r })
        if (r.finished) break
      } catch (e) {
        // שער שלא חיכה / תקלה רגעית — מנסים שוב את אותה מנה (היא ממשיכה מאותה נקודה)
        if (e.status === 409 || ++tries > 4) {
          put(i, { phase: 'error', error: e.message })
          return true
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
    if (stop.current && !progress.finished) {
      await sendJson(`/upload/${staged.token}`, undefined, 'DELETE').catch(() => {})
      put(i, { phase: 'stopped' })
    } else put(i, { phase: 'done' })
    return true
  }

  const take = async (files) => {
    const all = Array.from(files || []).sort(byName)
    if (!all.length || busy) return
    stop.current = false
    setBusy(true)
    setList(all.map((f) => ({ phase: 'wait', name: f.name })))
    for (let i = 0; i < all.length; i++) {
      if (stop.current) {
        put(i, { phase: 'cancelled' })
        continue
      }
      if (await one(all[i], i)) onDone?.()
    }
    if (alive.current) setBusy(false)
  }

  const finished = list.filter((s) => s.phase === 'done')
  const partial = list.some((s) => ['stopped', 'error'].includes(s.phase) && s.progress?.done > 0)
  // גם קליטה חלקית נשארת באתר; סופרים אותה בנפרד ממספר הקבצים שהסתיימו.
  const totals = list.reduce((sum, s) => {
    sum.inserted += s.progress?.inserted || 0
    sum.skipped += s.progress?.skipped || 0
    return sum
  }, { inserted: 0, skipped: 0 })
  return (
    <Card title={SECTION_LABELS[section]} icon={SECTION_ICONS[section]} className="min-w-0 flex-1 basis-72">
      <Muted>{HINTS[section]}</Muted>
      <label
        data-drop={section}
        onDragOver={(e) => {
          e.preventDefault()
          setHot(true)
        }}
        onDragLeave={() => setHot(false)}
        onDrop={(e) => {
          e.preventDefault()
          setHot(false)
          take(e.dataTransfer.files)
        }}
        className={cx(
          'flex cursor-pointer flex-col items-center gap-1 rounded-(--radius-control) border-2 border-dashed p-5 text-center text-body-sm text-on-surface transition-colors',
          hot ? 'border-primary bg-surface-selected' : 'border-outline-variant bg-surface-container-low hover:bg-surface-container',
          busy && 'pointer-events-none opacity-(--button-disabled-opacity)'
        )}
      >
        <AppIcon name="upload_file" className="text-icon-xl text-on-surface-variant" />
        <span>
          <span className="text-label-lg">גררו לכאן קובצי ZIP</span> או לחצו לבחירה
        </span>
        <span className="text-body-sm text-on-surface-variant">מתחנת-האימון: "ייצוא לאתר — הגהה לאימון". חבילה בכמה חלקים — גררו את כולם יחד.</span>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          multiple
          hidden
          aria-label={`קובץ ZIP ל${SECTION_LABELS[section]}`}
          onChange={(e) => {
            take(e.target.files)
            e.target.value = ''
          }}
        />
      </label>

      {list.length > 1 && (
        <div className="text-body-sm text-on-surface" role="status" aria-live="polite">
          {busy ? (
            <>
              מעלה {fmt(list.length)} קבצים בזה אחר זה — {fmt(list.filter((s) => !['wait', 'check', 'ingest'].includes(s.phase)).length)} הסתיימו.
            </>
          ) : (
            <span className="text-label-lg">
              {fmt(finished.length)} מתוך {fmt(list.length)} קבצים נקלטו: {fmt(totals.inserted)} חדשים{totals.skipped ? `, ${fmt(totals.skipped)} כבר היו באתר` : ''}{partial ? ' (כולל קליטה חלקית)' : ''}.
            </span>
          )}
        </div>
      )}
      {list.map((st, i) => (
        <FileStatus key={i} section={section} st={st} onStop={() => (stop.current = true)} />
      ))}
    </Card>
  )
}

// שורת המצב של קובץ אחד
function FileStatus({ section, st, onStop }) {
  return (
    <div className="flex flex-col gap-1.5 text-body-sm text-on-surface" role="status" aria-live="polite">
      <div className="truncate text-body-sm text-on-surface-variant" dir="ltr">
        {st.name}
      </div>
      {st.phase === 'wait' && <div className="text-on-surface-variant">ממתין בתור…</div>}
      {st.phase === 'cancelled' && <div className="text-on-warning-container">לא הועלה (נעצר).</div>}
      {st.phase === 'check' && <div>בודק את הקובץ…</div>}
      {st.staged && (
        <div>
          <span className="text-label-md">נקרא מהקובץ:</span> {readText(section, st.staged.read)}
          {st.staged.manifest.label && <div className="text-on-surface-variant">"{st.staged.manifest.label}" · חלק {st.staged.manifest.part} מתוך {st.staged.manifest.parts}</div>}
          {st.staged.existing > 0 && (
            <div className="mt-1 rounded-(--radius-control) bg-warning-container px-2 py-1 text-on-warning-container">
              החבילה הזו כבר הועלתה: {fmt(st.staged.existing)} פריטים כבר באתר{st.staged.proofed ? ` (${fmt(st.staged.proofed)} כבר הוגו)` : ''} — הם לא ישוכפלו ולא יידרסו.
            </div>
          )}
          {st.staged.warnings?.map((w) => (
            <div key={w} className="mt-1 rounded-(--radius-control) bg-warning-container px-2 py-1 text-on-warning-container">
              {w}
            </div>
          ))}
        </div>
      )}
      {st.progress && (
        <div className="flex items-center gap-2">
          <ProgressBar value={st.progress.done} max={st.progress.total} label={`הקליטה של ${st.name}`} valueText={`${fmt(st.progress.done)} מתוך ${fmt(st.progress.total)}`} className="flex-1" />
          <span className="tabular-nums text-on-surface-variant">
            {fmt(st.progress.done)} / {fmt(st.progress.total)}
          </span>
        </div>
      )}
      {st.phase === 'ingest' && (
        <Button variant="text" size="sm" icon="stop_circle" onClick={onStop} className="self-start">
          עצור (מה שנקלט נשאר)
        </Button>
      )}
      {st.phase === 'done' && (
        <div className="text-label-md text-on-success-container">
          נקלט: {fmt(st.progress.inserted)} חדשים{st.progress.skipped ? `, ${fmt(st.progress.skipped)} כבר היו באתר` : ''}.
        </div>
      )}
      {st.phase === 'stopped' && <div className="text-on-warning-container">נעצר. מה שנקלט נשאר; החבילה מושהית עד שתעלו את הקובץ שוב.</div>}
      {st.phase === 'error' && (
        <div className="rounded-(--radius-control) bg-error-container px-3 py-2 text-on-error-container">
          {st.wrong ? (
            <>
              <span className="text-label-md">הקובץ הזה שייך ל"{SECTION_LABELS[st.wrong]}", לא ל"{SECTION_LABELS[section]}".</span> העלו אותו בכרטיס של {SECTION_LABELS[st.wrong]}.
            </>
          ) : (
            <span className="text-label-md">{st.error}</span>
          )}
          {st.errors?.length > 1 && (
            <ul className="mt-1 list-disc ps-5">
              {st.errors.slice(1, 10).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
