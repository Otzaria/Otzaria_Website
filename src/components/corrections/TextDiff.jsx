'use client'

import { useMemo } from 'react'
import { buildDiffView, revealInvisible } from '@/lib/corrections/diff-view'

// כל התוכן מוצג כטקסט React (לא HTML) — תגיות בתוך שורת הספר נראות כמו שהן.
function Chars({ parts, side }) {
  return parts.map((p, i) => {
    const changed = p.type !== 'equal'
    const cls = !changed ? '' : side === 'before' ? 'bg-danger-200 text-danger-900 rounded-sm' : 'bg-success-200 text-success-900 rounded-sm'
    return <span key={i} className={cls}>{changed ? revealInvisible(p.text) : p.text}</span>
  })
}

/**
 * @param {{before:string, after:string}} props
 */
export default function TextDiff({ before, after }) {
  const segs = useMemo(() => buildDiffView(before ?? '', after ?? ''), [before, after])
  const renderSide = (side) =>
    segs.map((s, i) => {
      if (s.type === 'equal') return <span key={i}>{s.text}</span>
      if (s.type === 'change') {
        const parts = side === 'before' ? s.before : s.after
        return <span key={i} className={side === 'before' ? 'bg-danger-50' : 'bg-success-50'}><Chars parts={parts} side={side} /></span>
      }
      if (s.type === 'del' && side === 'before') return <span key={i} className="bg-danger-100 text-danger-800 line-through decoration-danger-400">{revealInvisible(s.text)}</span>
      if (s.type === 'add' && side === 'after') return <span key={i} className="bg-success-100 text-success-800">{revealInvisible(s.text)}</span>
      return null
    })

  return (
    <div className="grid gap-3 md:grid-cols-2" dir="rtl">
      <div>
        <div className="text-xs font-bold text-danger-700 mb-1">לפני (במקור)</div>
        <div className="rounded-lg border border-danger-200 bg-white p-3 whitespace-pre-wrap break-words leading-8 text-lg">{renderSide('before')}</div>
      </div>
      <div>
        <div className="text-xs font-bold text-success-700 mb-1">אחרי (מיועד)</div>
        <div className="rounded-lg border border-success-200 bg-white p-3 whitespace-pre-wrap break-words leading-8 text-lg">{renderSide('after')}</div>
      </div>
    </div>
  )
}
