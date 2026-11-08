'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { FIELD_ERROR, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import CheckRow from '@/components/ui/CheckRow'
import { DEFAULT_DAYS, MAX_DAYS, MAX_NAME, SCOPES, SCOPE_LABELS, validDays } from './tokenLabels'

// טופס מפתח גישה חדש: שם, תוקף בימים (ברירת מחדל 180) והרשאות (כולן מסומנות מראש).
// onCreate({name, days, scopes}) ← true כשנוצר (אז השם חוזר לברירת המחדל). הגוף שנשלח — כמו קודם.
// autoFocus — הפוקוס לשדה השם כשהטופס מופיע (אחרי "הסתר את המפתח").

const DEFAULT_NAME = 'צורת הדף'

export default function TokenCreateForm({ busy = false, disabled = false, onCreate, autoFocus = false }) {
  const ids = { name: useId(), days: useId(), daysError: useId() }
  const nameRef = useRef(null)
  useEffect(() => {
    if (autoFocus) nameRef.current?.focus()
  }, [autoFocus])
  const [name, setName] = useState(DEFAULT_NAME)
  const [days, setDays] = useState(String(DEFAULT_DAYS))
  const [scopes, setScopes] = useState(() => [...SCOPES])

  const daysValue = validDays(days)
  const ready = !busy && !disabled && name.trim().length > 0 && daysValue !== null && scopes.length > 0

  const toggle = (s) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : SCOPES.filter((x) => x === s || cur.includes(x))))

  const submit = async (e) => {
    e.preventDefault()
    if (!ready) return
    const ok = await onCreate({ name: name.trim(), days: daysValue, scopes })
    if (ok) setName(DEFAULT_NAME)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="מפתח גישה חדש">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-1 basis-64 flex-col">
          <label htmlFor={ids.name} className={FIELD_LABEL}>שם המפתח</label>
          <input ref={nameRef} id={ids.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME} placeholder="למשל: צורת הדף — השרת"
            className={fieldClasses()} />
        </div>
        <div className="flex flex-col">
          <label htmlFor={ids.days} className={FIELD_LABEL}>תוקף (ימים)</label>
          <input id={ids.days} type="number" min={1} max={MAX_DAYS} value={days} onChange={(e) => setDays(e.target.value)}
            aria-invalid={daysValue === null} aria-describedby={daysValue === null ? ids.daysError : undefined}
            className={fieldClasses({ invalid: daysValue === null, className: 'w-32' })} />
          {daysValue === null && <p id={ids.daysError} className={FIELD_ERROR}>מספר ימים שלם בין 1 ל-{MAX_DAYS}</p>}
        </div>
      </div>
      <fieldset className="flex flex-col">
        <legend className={FIELD_LABEL}>הרשאות</legend>
        {SCOPES.map((s) => (
          <CheckRow key={s} checked={scopes.includes(s)} onChange={() => toggle(s)}>{SCOPE_LABELS[s]}</CheckRow>
        ))}
        {scopes.length === 0 && <p className={FIELD_ERROR}>יש לבחור לפחות הרשאה אחת</p>}
      </fieldset>
      <div>
        <Button type="submit" icon="add" disabled={!ready && !busy} loading={busy}>
          צור מפתח
        </Button>
      </div>
    </form>
  )
}
