'use client'

import { useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import { SECTION_LABELS, SCRIPT_LABELS, OCR_ACTION_LABELS } from '@/lib/trainingProof/vocab'
import { getJson, fmtDate } from '../api'
import { Empty, Tag } from '../bits'
import { wordDiff } from '../wordDiff'

// "הצג תיקונים": מה שהמנהל שינה בסימונים של מתנדב אחד — הגרסה של המתנדב ← הגרסה של המנהל,
// החלק והתאריך, החדשים קודם. היומן נשמר גם אחרי שהפריטים ירדו לתחנה ונמחקו מהאתר.

const scriptName = (s) => SCRIPT_LABELS[s] || s || '—'

// גרסה אחת (של המתנדב או של המנהל) כטקסט קצר
function Version({ section, v, track }) {
  if (!v) return <span className="text-on-surface/50">—</span>
  if (section === 'ocr') {
    if (v.action === 'ok' || v.action === 'fixed')
      return (
        <span dir={track === 'latin' ? 'ltr' : 'rtl'}>
          {v.action === 'ok' ? 'נכון: ' : ''}
          {v.text}
        </span>
      )
    return <span>{OCR_ACTION_LABELS[v.action] || v.action}</span>
  }
  if (section === 'router') {
    if (v.bad) return <span>פסול</span>
    return (
      <span>
        {scriptName(v.label)}
        {v.label === 'mixed' && v.words ? ` — ${v.words.map(scriptName).join(' · ')}` : ''}
      </span>
    )
  }
  return <span>{v.status === 'skip' ? 'דלג' : `${v.frames} מסגרות`}</span>
}

// בזיהוי, כששני הצדדים טקסט — ההבדל ברמת מילה
function OcrDiff({ before, after, track }) {
  const dir = track === 'latin' ? 'ltr' : 'rtl'
  return (
    <span dir={dir} className="leading-7">
      {wordDiff(before.text, after.text).map((d, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {d.op === 'same' ? d.t : d.op === 'del' ? <del className="rounded bg-danger-100 px-0.5 text-danger-700">{d.t}</del> : <ins className="rounded bg-success-100 px-0.5 text-success-800 no-underline">{d.t}</ins>}
        </span>
      ))}
    </span>
  )
}

export default function CorrectionsDialog({ vol, onClose }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    getJson(`/volunteers/${vol.userId}/corrections`)
      .then((d) => live && setData(d))
      .catch((e) => live && setData({ items: [], error: e.message }))
    return () => {
      live = false
    }
  }, [vol.userId])

  return (
    <Dialog title={`התיקונים שלך בסימונים של ${vol.name || 'המתנדב'}`} subtitle="החדשים קודם · נשמרים גם אחרי ההורדה לתחנה" onClose={onClose} className="sm:max-w-3xl">
      {!data ? (
        <Empty>טוען…</Empty>
      ) : data.error ? (
        <Empty>{data.error}</Empty>
      ) : !data.items.length ? (
        <Empty>עוד לא תיקנת אף סימון שלו</Empty>
      ) : (
        <ol className="flex flex-col" aria-label="התיקונים">
          {data.items.map((c) => {
            const text = c.section === 'ocr' && c.before?.text && c.after?.text
            return (
              <li key={c.id} className="flex flex-col gap-1 border-b border-surface-variant py-2 text-sm last:border-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-on-surface/60">
                  <Tag tone="info">{SECTION_LABELS[c.section]}</Tag>
                  <span>{fmtDate(c.at)}</span>
                  <span>
                    · {c.alias} {c.page != null ? `עמ' ${c.page}` : ''}
                  </span>
                  {c.changes != null && <span>· {c.changes} מסגרות שונו</span>}
                </div>
                <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5">
                  <span className="text-xs text-on-surface/60">המתנדב:</span>
                  <Version section={c.section} v={c.before} track={c.track} />
                  <span className="text-xs text-on-surface/60">אתה:</span>
                  {text ? <OcrDiff before={c.before} after={c.after} track={c.track} /> : <Version section={c.section} v={c.after} track={c.track} />}
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {data?.items?.length >= (data?.keep || Infinity) && <p className="pt-2 text-xs text-on-surface/60">מוצגים {data.keep} התיקונים האחרונים — הישנים יותר לא נשמרים.</p>}
    </Dialog>
  )
}
