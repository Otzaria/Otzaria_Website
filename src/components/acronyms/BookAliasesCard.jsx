'use client'

import { useState } from 'react'
import { aliasProblem } from '@/lib/acronyms/normalize'
import { bookView } from '@/lib/acronyms/basket'

const CHIP_CLASSES = {
  kept: 'bg-success-50 text-success-800 border-success-200',
  added: 'bg-info-50 text-info-800 border-info-200',
  renamed: 'bg-warning-strong-50 text-warning-strong-800 border-warning-strong-200',
  removed: 'bg-danger-50 text-danger-700 border-danger-200 line-through',
}

const CHIP_TITLES = { added: 'יתווסף', renamed: 'ייערך', removed: 'יימחק' }

function describePending(op) {
  if (op.type === 'add') return `הוספה: ${op.alias}`
  if (op.type === 'remove') return `מחיקה: ${op.alias}`
  return `עריכה: ${op.from} ← ${op.to}`
}

function AliasChip({ chip, onEdit, onRemove, onUndo }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(chip.text)

  if (editing) {
    return (
      <div className="px-2 py-1 text-sm rounded-md border bg-white flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEdit(value)) setEditing(false)
            if (e.key === 'Escape') setEditing(false)
          }}
          className="border rounded px-2 py-0.5 text-sm"
          autoFocus
        />
        <button type="button" onClick={() => onEdit(value) && setEditing(false)} className="text-xs px-2 py-0.5 rounded bg-info-600 text-white">
          עדכון
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs px-2 py-0.5 rounded border border-neutral-300">
          ביטול
        </button>
      </div>
    )
  }

  return (
    <div className={`px-2 py-1 text-sm rounded-md border flex items-center gap-1 ${CHIP_CLASSES[chip.state]}`} title={chip.from ? `במקום: ${chip.from}` : CHIP_TITLES[chip.state]}>
      <span>{chip.text}</span>
      {chip.state === 'removed' ? (
        <button type="button" onClick={onUndo} className="text-xs px-1 rounded bg-white border" aria-label="ביטול המחיקה">
          <span className="material-symbols-outlined text-sm align-middle">undo</span>
        </button>
      ) : (
        <>
          <button type="button" onClick={() => { setValue(chip.text); setEditing(true) }} className="text-xs px-1 rounded bg-white border" aria-label="עריכה">
            <span className="material-symbols-outlined text-sm align-middle">edit</span>
          </button>
          <button type="button" onClick={onRemove} className="text-xs px-1 rounded bg-white border border-danger-300 text-danger-700" aria-label="מחיקה">
            <span className="material-symbols-outlined text-sm align-middle">delete</span>
          </button>
        </>
      )}
    </div>
  )
}

/**
 * ספר אחד: הכינויים כפי שייראו אחרי הסל, ושינויים שכבר ממתינים ב-PR פתוח.
 * @param {{book:{title:string, aliases:string[]}, basket:object[], pending:Array<{op:object, prNumber:number, prUrl:string}>, onOp:(op:object)=>void, onError:(msg:string)=>void}} props
 */
export default function BookAliasesCard({ book, basket, pending, onOp, onError }) {
  const [newAlias, setNewAlias] = useState('')
  const chips = bookView(book.aliases, basket, book.title)

  const submitAdd = () => {
    const problem = aliasProblem(newAlias, book.title)
    if (problem) return onError(problem)
    onOp({ type: 'add', book: book.title, alias: newAlias, ...(book.isNew ? { newBook: true } : {}) })
    setNewAlias('')
  }

  const edit = (chip, value) => {
    const problem = aliasProblem(value, book.title)
    if (problem) {
      onError(problem)
      return false
    }
    if (value.trim() === chip.text) return true
    onOp({ type: 'rename', book: book.title, from: chip.from || chip.text, to: value })
    return true
  }

  return (
    <div className="rounded-xl border border-surface-variant bg-white p-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
        <div className="text-lg font-bold text-on-surface">
          {book.title}
          {book.isNew && <span className="text-sm font-normal text-on-surface/60 mr-2">(ספר חדש ברשימה)</span>}
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <input
            type="text"
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitAdd()}
            placeholder="כינוי או ר״ת חדש"
            className="flex-1 md:w-72 border rounded-lg px-3 py-2"
          />
          <button type="button" onClick={submitAdd} className="px-4 py-2 rounded-lg bg-primary text-on-primary flex items-center gap-1">
            <span className="material-symbols-outlined text-base">playlist_add</span>
            לסל
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.length === 0 ? (
          <span className="text-sm text-on-surface/50">אין כינויים</span>
        ) : (
          chips.map((chip) => (
            <AliasChip
              key={`${chip.state}:${chip.from || chip.text}`}
              chip={chip}
              onEdit={(value) => edit(chip, value)}
              onRemove={() => onOp({ type: 'remove', book: book.title, alias: chip.text })}
              onUndo={() => onOp({ type: 'add', book: book.title, alias: chip.text })}
            />
          ))
        )}
      </div>

      {pending.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {pending.map((p, i) => (
            <a
              key={i}
              href={p.prUrl}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-1 rounded-md bg-warning-strong-50 text-warning-strong-800 border border-warning-strong-200 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">pending</span>
              {describePending(p.op)} (בבדיקה, #{p.prNumber})
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
