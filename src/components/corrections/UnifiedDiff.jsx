'use client'

import { useMemo } from 'react'
import { buildUnifiedRows, revealInvisible } from '@/lib/corrections/diff-view'

const ROW = {
  context: { row: '', marker: 'text-on-surface/40', text: 'text-on-surface/80', label: 'הקשר' },
  removed: { row: 'bg-danger-50', marker: 'text-danger-700', text: 'text-on-surface', label: 'הוסר' },
  added: { row: 'bg-success-50', marker: 'text-success-700', text: 'text-on-surface', label: 'נוסף' },
  reported: { row: 'bg-info-50', marker: 'text-info-700', text: 'text-on-surface', label: 'השורה המדווחת' },
}

// טקסט React בלבד — תגיות HTML בשורת הספר מוצגות כמו שהן.
function Parts({ parts, kind }) {
  return parts.map((p, i) => {
    if (p.level === 0) return <span key={i}>{p.text}</span>
    const strong = p.level === 2
    const Tag = kind === 'removed' ? 'del' : 'ins'
    const cls = kind === 'removed'
      ? (strong ? 'bg-danger-200 text-danger-900' : 'bg-danger-100')
      : (strong ? 'bg-success-200 text-success-900' : 'bg-success-100')
    return <Tag key={i} className={`no-underline rounded-sm ${cls}`}>{strong ? revealInvisible(p.text) : p.text}</Tag>
  })
}

/**
 * diff בסגנון סקירת קוד: שורות הקשר מהקובץ, שורה שהוסרה (−) ושורה שנוספה (+).
 * @param {{before:string, after:(string|null), context?:object|null, lineIndex?:number|null, path?:string|null,
 *          contextNote?:string|null, onExpand?:Function|null, expanding?:boolean}} props
 */
export default function UnifiedDiff({ before, after, context = null, lineIndex = null, path = null, contextNote = null, onExpand = null, expanding = false }) {
  const model = useMemo(() => buildUnifiedRows({ context, lineIndex, originalLine: before ?? '', newLine: after ?? null }), [context, lineIndex, before, after])

  return (
    <figure className="m-0 rounded-lg border border-neutral-cool-200 bg-white overflow-hidden" dir="rtl">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-neutral-cool-50 border-b border-neutral-cool-200 text-xs text-on-surface/70">
        {model.hasFileContext
          ? <span className="font-mono break-all" dir="ltr">{path}</span>
          : <span>{contextNote || 'הקשר מהקובץ אינו זמין — מוצגת רק השורה מהדיווח.'}</span>}
        {model.canExpand && onExpand && (
          <button type="button" onClick={onExpand} disabled={expanding} className="px-2 py-0.5 rounded-md border border-neutral-cool-300 bg-white text-on-surface hover:bg-neutral-cool-100 disabled:opacity-50">
            הרחב הקשר
          </button>
        )}
      </figcaption>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-lg leading-8" aria-label={model.noProposal ? 'השורה המדווחת (ללא הצעה)' : 'השינוי בקובץ המקור'}>
          <tbody>
            {model.rows.map((r, i) => {
              const s = ROW[r.kind]
              return (
                <tr key={i} className={s.row}>
                  <td className="w-12 px-2 align-top text-center text-xs leading-8 font-mono tabular-nums text-on-surface/50 bg-neutral-cool-50 border-l border-neutral-cool-200 select-none" dir="ltr">
                    {r.lineNumber ?? ''}
                  </td>
                  <td className={`w-6 align-top text-center font-mono font-bold select-none ${s.marker}`} aria-hidden="true">{r.marker}</td>
                  <td className={`px-2 whitespace-pre-wrap break-words ${s.text}`} dir="rtl">
                    <span className="sr-only">{r.lineNumber ? `${s.label}, שורה ${r.lineNumber}: ` : `${s.label}: `}</span>
                    {r.kind === 'context'
                      ? (r.text === '' ? <span className="text-on-surface/30">(שורה ריקה)</span> : r.text)
                      : r.kind === 'added' && r.text === ''
                        ? <span className="text-success-800 italic">(השורה תישאר ריקה)</span>
                        : <Parts parts={r.parts} kind={r.kind} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {(model.noProposal || model.emptied) && (
        <p className="m-0 px-3 py-1.5 border-t border-neutral-cool-200 text-xs text-on-surface/70">
          {model.noProposal ? 'לא הוצע נוסח — מוצגת השורה המקורית בלבד, בלי שורת +.' : 'הצעה למחיקת כל תוכן השורה: השורה נשארת בקובץ, ריקה.'}
        </p>
      )}
    </figure>
  )
}
