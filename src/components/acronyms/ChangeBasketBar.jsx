'use client'

import { useState } from 'react'

function describe(op) {
  if (op.type === 'add') return `הוספה: ${op.alias}`
  if (op.type === 'remove') return `מחיקה: ${op.alias}`
  return `עריכה: ${op.from} ← ${op.to}`
}

/**
 * פס הסל בתחתית הדף: פירוט השינויים ושליחתם כבקשת שינוי (PR) אחת לפורק.
 * @param {{basket:object[], submitting:boolean, onRemove:(index:number)=>void, onClear:()=>void, onSubmit:()=>void}} props
 */
export default function ChangeBasketBar({ basket, submitting, onRemove, onClear, onSubmit }) {
  const [open, setOpen] = useState(false)
  if (basket.length === 0) return null
  const books = new Set(basket.map((o) => o.book)).size

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 border-t border-surface-variant bg-white shadow-lg">
      <div className="container mx-auto px-4 py-3 max-w-7xl">
        {open && (
          <div className="max-h-72 overflow-y-auto mb-3 divide-y border rounded-lg">
            {basket.map((op, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{op.book}</span>
                  {op.newBook && <span className="text-on-surface/60"> (ספר חדש)</span>}: {describe(op)}
                </span>
                <button type="button" onClick={() => onRemove(i)} aria-label="הסרה מהסל" className="p-1 rounded hover:bg-surface-variant">
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-on-surface font-medium">
            {basket.length} שינויים ב-{books} ספרים {open ? '▲' : '▼'}
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClear} disabled={submitting} className="px-4 py-2 rounded-lg border border-neutral-300 disabled:opacity-50">
              ניקוי הסל
            </button>
            <button type="button" onClick={onSubmit} disabled={submitting} className="px-4 py-2 rounded-lg bg-primary text-on-primary disabled:opacity-50 flex items-center gap-1">
              <span className="material-symbols-outlined text-base">send</span>
              {submitting ? 'שולח...' : 'שליחה לבדיקה'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
