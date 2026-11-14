'use client'

import { useId, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import DrawBox from './DrawBox'
import { REPORT_CATEGORIES } from './labels'
import { MAX_REPORT_TEXT, regionOf, regionsOf, validateReport } from './reportLogic'

// חלון דיווח: סוג הבעיה, תיאור (חובה ב"אחר"), ומלבן אחד על הסריקה ו/או על העמוד שלנו (DrawBox).
// initial — דיווח קיים לעריכה ({category, text, regions}) או {category} מ"יש בעיה" במבט הכללי.
// onSave(report) — הדיווח אחרי בדיקה (validateReport). scan/ours — {url, w, h} של העמוד.

export default function ReportDialog({ initial = null, scan, ours, onSave, onClose }) {
  const [category, setCategory] = useState(initial?.category || '')
  const [text, setText] = useState(initial?.text || '')
  const [boxes, setBoxes] = useState(() => ({ scan: regionOf(initial?.regions, 'scan'), ours: regionOf(initial?.regions, 'ours') }))
  const [error, setError] = useState(null)
  const catId = useId()
  const textId = useId()
  const errId = useId()

  const save = () => {
    const report = { category, text: text.trim(), regions: regionsOf(boxes) }
    const err = validateReport(report)
    if (err) {
      setError(err)
      return
    }
    onSave(report)
  }

  return (
    <Dialog
      title={initial?.text != null || initial?.regions ? 'עריכת דיווח' : 'דיווח על בעיה בעמוד'}
      subtitle="מה לא נראה כמו בדפוס? סמנו את המקום על אחת התמונות, או על שתיהן."
      onClose={onClose}
      className="sm:max-w-6xl"
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            ביטול
          </Button>
          <Button icon="check" onClick={save}>
            שמירת הדיווח
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={catId} className="font-bold text-on-surface">
            סוג הבעיה
          </label>
          <select
            id={catId}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setError(null)
            }}
            aria-describedby={error ? errId : undefined}
            className="min-h-10 rounded-lg border border-outline-variant bg-surface px-3 text-on-surface"
          >
            <option value="">בחרו...</option>
            {REPORT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={textId} className="font-bold text-on-surface">
            תיאור{category === 'other' ? ' (חובה)' : ''}
          </label>
          <textarea
            id={textId}
            value={text}
            maxLength={MAX_REPORT_TEXT}
            rows={3}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            aria-describedby={error ? errId : undefined}
            placeholder={'למשל: שורה 12 ברש"י חסרה; הכותרת נמוכה מדי'}
            className="rounded-lg border border-outline-variant bg-white p-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        {error && (
          <p id={errId} role="alert" className="text-sm font-bold text-danger-700">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-3 lg:flex-row">
          {scan?.url && (
            <DrawBox src={scan.url} W={scan.w || 1000} H={scan.h || 1400} value={boxes.scan} onChange={(b) => setBoxes((x) => ({ ...x, scan: b }))} label="הסריקה" />
          )}
          {ours?.url && (
            <DrawBox src={ours.url} W={ours.w || 1000} H={ours.h || 1400} value={boxes.ours} onChange={(b) => setBoxes((x) => ({ ...x, ours: b }))} label="העמוד שלנו" />
          )}
        </div>
      </div>
    </Dialog>
  )
}
