'use client'

import { useState } from 'react'

/**
 * הסתרת ספרים מהתור (למשל ספר משובש שמציף אותו בדיווחים). שמות מדויקים, מתוך רשימת הספרים שיש להם דיווחים.
 * @param {{books:string[], hidden:string[], onChange:(hidden:string[])=>void}} props
 */
export default function HiddenBooksFilter({ books, hidden, onChange }) {
  const [draft, setDraft] = useState('')
  const name = draft.trim()
  const canAdd = Boolean(name) && !hidden.includes(name)

  const add = (e) => {
    e.preventDefault()
    if (!canAdd) return
    onChange([...hidden, name])
    setDraft('')
  }

  return (
    <div className="text-sm">
      הסתרת ספרים
      <form onSubmit={add} className="flex gap-1 mt-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          list="corrections-hidden-books"
          placeholder="שם הספר להסתרה"
          aria-label="שם הספר להסתרה"
          className="border rounded-lg px-2 py-1 bg-white"
        />
        <datalist id="corrections-hidden-books">
          {books.filter((b) => !hidden.includes(b)).map((b) => <option key={b} value={b} />)}
        </datalist>
        <button type="submit" disabled={!canAdd} className="px-2 py-1 rounded-lg glass hover:bg-surface-variant disabled:opacity-50 flex items-center" aria-label="הסתרה">
          <span className="material-symbols-outlined text-base">visibility_off</span>
        </button>
      </form>
      {hidden.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 max-w-md">
          {hidden.map((b) => (
            <span key={b} className="inline-flex items-center gap-1 rounded-full bg-surface-variant px-2 py-0.5 text-xs">
              {b}
              <button type="button" onClick={() => onChange(hidden.filter((x) => x !== b))} aria-label={`הצגת ${b} מחדש`} className="material-symbols-outlined text-sm opacity-70 hover:opacity-100">close</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
