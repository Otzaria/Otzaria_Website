'use client'

import { useState } from 'react'
import UnifiedDiff from '@/components/corrections/UnifiedDiff'
import TextDiff from '@/components/corrections/TextDiff'

const MODES = [
  { id: 'unified', label: 'תצוגת DIFF' },
  { id: 'split', label: 'זה מול זה' },
]

/**
 * השינוי בתצוגת diff (ברירת מחדל) או זה מול זה. split = תוכן חלופי לתצוגה זו מול זו (אם לא ניתן — TextDiff).
 * @param {{title:string, description?:string, split?:import('react').ReactNode} & Parameters<typeof UnifiedDiff>[0]} props
 */
export default function ChangeDiff({ title, description = null, split = null, ...diff }) {
  const [mode, setMode] = useState('unified')
  const canSplit = Boolean(split) || typeof diff.after === 'string'
  const current = canSplit ? mode : 'unified'
  return (
    <section className="glass rounded-xl p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{title}</h3>
        {canSplit && (
          <div role="group" aria-label="אופן התצוגה" className="inline-flex rounded-lg border border-neutral-cool-200 overflow-hidden text-sm">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={current === m.id}
                onClick={() => setMode(m.id)}
                className={`px-3 py-1 ${current === m.id ? 'bg-primary text-on-primary' : 'bg-white text-on-surface hover:bg-neutral-cool-50'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {description && <p className="text-xs text-on-surface/60">{description}</p>}
      {current === 'unified' ? <UnifiedDiff {...diff} /> : split || <TextDiff before={diff.before} after={diff.after} />}
    </section>
  )
}
