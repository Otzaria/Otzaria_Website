'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { streamInfo, isFurnitureStream, CERTAINTY } from '@/lib/pageProof/vocab'
import { wordTokens } from '@/lib/pageProof/view'
import WordSuggestions from './WordSuggestions'

// שורה אחת בלוח-הטקסט. מילה: קו אדום מקווקו = ביטחון-זיהוי נמוך; קו כחול
// מנוקד = יש חלופות; רקע סגול/כתום = מודל-השפה חושד. לחיצה-כפולה = עריכה.

function wordClass(t, inRange) {
  const c = ['rounded-sm', 'px-px', 'relative']
  if (t.low) c.push('underline decoration-dashed decoration-red-500 decoration-2 underline-offset-4')
  else if (t.alt) c.push('underline decoration-dotted decoration-blue-600 decoration-2 underline-offset-4')
  if (t.lmKinds.includes('lm')) c.push('bg-[#7c3aed26]')
  else if (t.lmKinds.includes('rec')) c.push('bg-[#f9731633]')
  if (inRange) c.push('ring-2 ring-amber-500')
  if (t.styles.includes('b') || t.styles.includes('heavy')) c.push('font-bold')
  if (t.styles.includes('sup')) c.push('align-super text-xs')
  if (t.styles.includes('spaced')) c.push('tracking-widest')
  if (t.styles.includes('big')) c.push('text-lg')
  if (t.styles.includes('small')) c.push('text-xs')
  if (t.styles.includes('i')) c.push('italic')
  return c.join(' ')
}

function ProofLineRow({ line, doc, lowWord, selected, wordRange, straddle, readOnly, onSelect, onWordClick, onEditText, onPickWord }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [pop, setPop] = useState(null)
  const rowRef = useRef(null)
  const s = streamInfo(doc, line.stream)
  const removed = line.status === 'removed'
  const furniture = isFurnitureStream(line.stream)
  const locked = readOnly || line._new || removed

  useEffect(() => {
    if (selected && rowRef.current) rowRef.current.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const startEdit = () => {
    if (locked) return
    setDraft(line.text ?? '')
    setEditing(true)
  }
  const commit = () => {
    setEditing(false)
    if (draft !== (line.text ?? '')) onEditText(line.id, draft)
  }

  const tokens = wordTokens(line, lowWord)
  const [lo, hi] = wordRange || [-1, -2]

  return (
    <div
      ref={rowRef}
      data-line={line.id}
      onClick={(e) => onSelect(line.id, e.shiftKey || e.ctrlKey || e.metaKey)}
      className={`group flex items-start gap-2 border-r-4 px-2 py-1 text-base leading-8 transition-colors ${
        selected ? 'bg-primary/10' : 'hover:bg-surface-variant/50'
      } ${furniture ? 'text-on-surface/40' : ''} ${removed ? 'opacity-50' : ''}`}
      style={{ borderRightColor: s.color }}
    >
      <span className="mt-1 w-7 shrink-0 text-left text-xs text-on-surface/40 tabular-nums">{line.id > 0 ? (line.line_no ?? 0) + 1 : '+'}</span>

      <div className="min-w-0 flex-1">
        {editing ? (
          <textarea
            autoFocus
            dir="rtl"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                commit()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setEditing(false)
              }
              e.stopPropagation()
            }}
            rows={Math.max(1, Math.ceil((draft.length || 1) / 70))}
            className="w-full resize-none rounded border border-primary bg-surface px-2 py-0.5 font-[inherit] text-base leading-7 outline-none"
          />
        ) : (
          <span className={`${removed ? 'line-through' : ''}`} onDoubleClick={startEdit}>
            {tokens.length === 0 && <span className="text-on-surface/30">(ריקה)</span>}
            {tokens.map((t, k) =>
              t.kind === 'space' ? (
                <span key={k}>{t.text}</span>
              ) : (
                <span
                  key={k}
                  className={wordClass(t, selected && t.i >= lo && t.i <= hi)}
                  onClick={(e) => {
                    if (!selected) return
                    e.stopPropagation()
                    onWordClick(line.id, t.i, e.shiftKey)
                  }}
                  onMouseEnter={() => (t.alt || t.lm) && setPop(t.i)}
                >
                  {t.text}
                  {pop === t.i && (t.alt || t.lm) && (
                    <WordSuggestions
                      token={t}
                      readOnly={locked}
                      onClose={() => setPop(null)}
                      onPick={(w) => {
                        setPop(null)
                        onPickWord(line.id, t.i, w)
                      }}
                    />
                  )}
                </span>
              )
            )}
          </span>
        )}
      </div>

      <div className="mt-1 flex shrink-0 flex-wrap items-center justify-end gap-1 text-[11px]">
        {line._new && <span className="rounded bg-info-100 px-1.5 text-info-800">חדשה</span>}
        {line.status === 'fixed' && <span className="rounded bg-success-100 px-1.5 text-success-800">תוקן</span>}
        {line._ok && <span className="rounded bg-success-100 px-1.5 text-success-800">✓ נכונה</span>}
        {removed && <span className="rounded bg-surface-variant px-1.5">הוסרה</span>}
        {straddle && <span className="rounded bg-danger-100 px-1.5 text-danger-700" title="בולטת מהמסגרת — לא נספרת כתיוג">בולטת</span>}
        {line.certainty && line.certainty !== 'certain' && (
          <span className="rounded bg-warning-alt-100 px-1.5 text-warning-alt-800" title={line.certainty_why || ''}>
            {CERTAINTY[line.certainty]}
          </span>
        )}
        <span className="rounded px-1.5 text-white" style={{ background: s.color }} title={`מקור: ${line.stream_src || 'auto'}`}>
          {s.he}
          {s.heading ? ' ·כותרת' : ''}
          {line.stream_src === 'human' ? ' ✎' : line.stream_src === 'frame' ? ' ▭' : ''}
        </span>
      </div>
    </div>
  )
}

export default memo(ProofLineRow)
