'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import FastItemCard from './FastItemCard'
import ManualItemDialog from './ManualItemDialog'
import { answerReady } from './fastLogic'
import { num } from './labels'

// שלב "נוסח": שאלות הנוסח של העמוד (FastItemCard בתצוגה מצומצמת) — התשובות נאספות (answers) ונשלחות רק בהגשה;
// ומתחת — "בדפוס כתוב אחרת" (ManualItemDialog): מילים בעמוד שלנו שבדפוס כתובות אחרת ואין עליהן שאלה.

export default function TextStage({ pageId, items, answers, onAnswer, manualItems, onAddManual, onRemoveManual, model, scan, readOnly = false }) {
  const [manualOpen, setManualOpen] = useState(false)
  const answered = (items || []).filter((it) => answerReady(answers?.[it.id])).length

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3" aria-labelledby="th-items">
        <h2 id="th-items" className="font-bold text-on-surface">
          שאלות הנוסח בעמוד ({num(answered)} מתוך {num((items || []).length)} נענו)
        </h2>
        {!items?.length ? (
          <p className="text-on-surface/60">אין בעמוד הזה שאלות נוסח פתוחות.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {items.map((it) => (
              <li key={it.id} className="glass-strong rounded-xl p-4">
                <FastItemCard item={it} value={answers?.[it.id] || null} onChange={(v) => onAnswer(it.id, v ? { ...v, revision: it.revision } : null)} compact disabled={readOnly} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="glass-strong flex flex-col gap-3 rounded-xl p-4" aria-labelledby="th-manual">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="th-manual" className="font-bold text-on-surface">
            בדפוס כתוב אחרת
          </h2>
          {!readOnly && (
            <Button variant="tonal" icon="add" onClick={() => setManualOpen(true)}>
              סימון מילים
            </Button>
          )}
        </div>
        <p className="text-sm text-on-surface/70">מצאתם בעמוד שלנו מילה שבדפוס כתובה אחרת, ואין עליה שאלה למעלה? סמנו אותה וכתבו מה נדפס.</p>
        {manualItems?.length > 0 && (
          <ul className="flex flex-col gap-1" data-testid="manual-list">
            {manualItems.map((m, i) => (
              <li key={`${m.block}:${m.line}:${m.ref}:${m.wi}:${i}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-variant/50 px-3 py-2">
                <span className="font-frank text-lg line-through decoration-danger-500">{(m.otz || []).join(' ')}</span>
                <span aria-hidden="true">←</span>
                <span className="font-frank text-lg font-bold">{m.text}</span>
                {m.box && <span className="text-xs text-on-surface/60">(מסומן בסריקה)</span>}
                {!readOnly && (
                  <button type="button" onClick={() => onRemoveManual(i)} className="ms-auto flex items-center gap-1 rounded px-2 text-sm text-danger-700 hover:bg-danger-50" aria-label={`מחיקת התיקון ${m.text}`}>
                    <span aria-hidden="true" className="material-symbols-outlined text-base">delete</span>
                    מחיקה
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {manualOpen && (
        <ManualItemDialog
          pageId={pageId}
          model={model}
          scan={scan}
          onClose={() => setManualOpen(false)}
          onSave={(entry) => {
            onAddManual(entry)
            setManualOpen(false)
          }}
        />
      )}
    </div>
  )
}
