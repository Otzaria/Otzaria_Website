'use client'

import { useState } from 'react'
import { DEFAULT_DAYS, MAX_DAYS, MAX_NAME, SCOPES, SCOPE_LABELS, validDays } from '@/lib/pageProof/tokenRules'

// טופס מפתח-גישה חדש: שם, תוקף בימים (ברירת מחדל 180) והרשאות (כולן מסומנות מראש).
// onCreate({name, days, scopes}) ← true כשנוצר (אז השם חוזר לברירת-המחדל).

const DEFAULT_NAME = 'תוכנת-הספר'

export default function TokenCreateForm({ busy = false, disabled = false, onCreate }) {
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
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label="מפתח-גישה חדש">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          שם המפתח
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME}
            placeholder="למשל: תוכנת-הספר — המחשב בבית"
            className="w-72 rounded border border-surface-variant bg-surface px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          תוקף (ימים)
          <input
            type="number"
            min={1}
            max={MAX_DAYS}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className={`w-24 rounded border bg-surface px-2 py-1 ${daysValue === null ? 'border-danger-500' : 'border-surface-variant'}`}
          />
        </label>
      </div>
      {daysValue === null && <p className="text-xs text-danger-700">תוקף: מספר ימים שלם בין 1 ל-{MAX_DAYS}</p>}
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1 font-medium">הרשאות</legend>
        {SCOPES.map((s) => (
          <label key={s} className="flex items-center gap-2">
            <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} />
            {SCOPE_LABELS[s]}
          </label>
        ))}
        {scopes.length === 0 && <p className="text-xs text-danger-700">יש לבחור לפחות הרשאה אחת</p>}
      </fieldset>
      <div>
        <button type="submit" disabled={!ready} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-on-primary hover:opacity-90 disabled:opacity-40">
          <span className="material-symbols-outlined text-base">{busy ? 'hourglass_top' : 'add'}</span>
          צור מפתח
        </button>
      </div>
    </form>
  )
}
