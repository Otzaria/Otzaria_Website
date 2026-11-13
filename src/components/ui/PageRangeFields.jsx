'use client'

import { useId } from 'react'
import { cx } from './cx'
import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL_COMPACT, fieldClasses } from './fieldStyles'

/**
 * שני שדות "מעמוד" / "עד עמוד" — רכיב שליטה (הערכים מחרוזות, כמו שהמשתמש הקליד). הפירוש והבדיקה —
 * אצל ההורה, עם parsePageRangeInput מ-@/lib/pageRange (כך ההודעה מותאמת להקשר: העלאה / OCR).
 * ריק = מתחילת / עד סוף; ה-placeholder מראה את זה (1 ו-total).
 *
 * @param {{
 *   legend?: string,
 *   value: { from: string, to: string },
 *   onChange: (next: { from: string, to: string }) => void,
 *   total?: number,              // מספר העמודים (ל-placeholder של "עד")
 *   disabled?: boolean,
 *   error?: string,              // הודעת שגיאה (בעברית) מתחת לשדות
 *   errorField?: 'from'|'to',    // איזה שדה מסומן כשגוי (ברירת מחדל: שניהם)
 *   hint?: import('react').ReactNode, // שורת הסבר / סיכום מתחת לשדות (למשל "יועלו 12 עמודים")
 * }} props
 */
export default function PageRangeFields({ legend = 'טווח עמודים', value, onChange, total, disabled = false, error, errorField, hint }) {
  const base = useId()
  const ids = { from: `${base}-from`, to: `${base}-to`, hint: `${base}-hint`, error: `${base}-error` }
  const describedBy = [hint && ids.hint, error && ids.error].filter(Boolean).join(' ') || undefined
  const invalid = (field) => Boolean(error) && (!errorField || errorField === field)
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value.replace(/[^\d]/g, '') })

  const field = (key, label, placeholder) => (
    <div className="min-w-0 flex-1">
      <label htmlFor={ids[key]} className={FIELD_LABEL_COMPACT}>{label}</label>
      <input
        id={ids[key]}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        dir="ltr"
        value={value?.[key] ?? ''}
        placeholder={placeholder}
        onChange={set(key)}
        disabled={disabled}
        aria-invalid={invalid(key) || undefined}
        aria-describedby={describedBy}
        className={cx(fieldClasses({ invalid: invalid(key) }), 'text-center tabular-nums')}
      />
    </div>
  )

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="mb-2 block text-label-lg text-on-surface">{legend}</legend>
      <div className="flex items-end gap-3">
        {field('from', 'מעמוד', '1')}
        <span aria-hidden="true" className="pb-3 text-on-surface-variant">–</span>
        {field('to', 'עד עמוד', total ? String(total) : '')}
      </div>
      {hint && <p id={ids.hint} className={FIELD_HINT}>{hint}</p>}
      {error && <p id={ids.error} role="alert" className={FIELD_ERROR}>{error}</p>}
    </fieldset>
  )
}
