'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SUBMIT_CHOICE, SUBMIT_ERRORS } from '@/lib/pageProof/submitPlan'
import { bookOnlySubmitLine } from '@/lib/pageProof/helpTexts'

// חלון ההגשה של דף המתנדב. summary — הפלט של submitSummary (lib/pageProof/
// submitPlan.js): כמה פסקאות אושרו, כמה שינויים, ואילו בחירות מוצעות.
//   * הכול אושר ← "הגש".
//   * לא הכול  ← "אשר גם את כל השאר והגש" (רק אחרי "קראתי את כל הטקסט
//     בעמוד") או "הגש רק את מה שאישרתי" (חסום כשאין מה להגיש).
// onSubmit(choice, {readAll}) — הדף בונה את הפעולות (planSubmission) ושולח.

const plural = (n, one, many) => (n === 1 ? one : `${n.toLocaleString('he-IL')} ${many}`)

export default function SubmitDialog({ pageNo, summary, note = '', onNote, saving = false, error = null, onCancel, onSubmit }) {
  const [readAll, setReadAll] = useState(false)
  const [clicked, setClicked] = useState(null)
  const panel = useRef(null)
  const titleId = useId()
  const noteId = useId()

  // Esc סוגר רק את החלון הזה (בשלב-הלכידה, לפני העורך שמתחתיו)
  useEffect(() => {
    panel.current?.focus()
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      if (!saving) onCancel?.()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [saving, onCancel])

  if (!summary || typeof document === 'undefined') return null
  const { approval, opCount, restCount, allApproved, recut, recheckCount, bookOnlyCount = 0 } = summary

  const submit = (choice) => {
    setClicked(choice)
    onSubmit?.(choice, { readAll })
  }
  const label = (choice, text) => (saving && clicked === choice ? 'שולח...' : text)

  const btn = 'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && onCancel?.()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        dir="rtl"
        className="glass-strong flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl p-6 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id={titleId} className="flex items-center gap-2 text-xl font-bold text-on-surface">
            <span aria-hidden="true" className="material-symbols-outlined text-success-600">send</span>
            הגשת עמוד {pageNo}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {approval && approval.total > 0 && (
              <span className={`rounded-full px-3 py-0.5 font-bold ${allApproved ? 'bg-success-100 text-success-800' : 'bg-warning-alt-100 text-warning-alt-800'}`}>
                אושרו {approval.approved.toLocaleString('he-IL')} מתוך {approval.total.toLocaleString('he-IL')} פסקאות
              </span>
            )}
            <span className="rounded-full bg-surface-variant px-3 py-0.5">{opCount === 0 ? 'אין שינויים' : plural(opCount, 'שינוי אחד', 'שינויים')}</span>
          </div>
        </div>

        {recheckCount > 0 && (
          <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800">
            מעבר שני: {plural(recheckCount, 'שורה אחת זוהתה', 'שורות זוהו')} מחדש ומסומנות בצהוב — ודאו שבדקתם אותן לפני ההגשה.
          </p>
        )}
        {bookOnlyCount > 0 && (
          <p data-testid="submit-book-only" className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800">
            {bookOnlySubmitLine(bookOnlyCount)}
          </p>
        )}
        {recut && (
          <p className="rounded-lg border border-info-200 bg-info-50 px-3 py-2 text-sm text-info-800">
            תיקנתם את חיתוך השורות או את המסגרות: אחרי אישור המנהל העמוד יחזור לתוכנה, ייחתך מחדש לפיהם, השורות שהשתנו ייקראו מחדש, והעמוד יחזור להגהה במעבר שני.
          </p>
        )}

        {allApproved ? (
          <div className="space-y-2">
            <p className="text-sm text-on-surface/80">
              {approval && approval.total > 0 ? 'כל הפסקאות אושרו — אפשר להגיש.' : 'כל השורות נבדקו — אפשר להגיש.'} מנהל יבדוק את ההגשה לפני שהיא נכנסת לספר.
            </p>
            {opCount === 0 && <p className="text-sm text-danger-700">{SUBMIT_ERRORS.empty}</p>}
            <button onClick={() => submit(SUBMIT_CHOICE.SUBMIT)} disabled={saving || opCount === 0} className={`${btn} bg-success-600`}>
              {label(SUBMIT_CHOICE.SUBMIT, 'הגש')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-bold text-on-surface">לא כל הפסקאות אושרו. מה להגיש?</p>

            <div className="space-y-2 rounded-xl border border-surface-variant p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-on-surface">
                <input type="checkbox" checked={readAll} onChange={(e) => setReadAll(e.target.checked)} disabled={saving} className="h-4 w-4" />
                קראתי את כל הטקסט בעמוד
              </label>
              <p className="text-xs text-on-surface/70">
                {restCount === 1
                  ? 'השורה היחידה שלא נגעתם בה תסומן "נכונה כפי שהיא".'
                  : `${restCount.toLocaleString('he-IL')} השורות שלא נגעתם בהן יסומנו "נכונות כפי שהן".`}{' '}
                רק אם באמת קראתם הכול מול הסריקה.
              </p>
              <button onClick={() => submit(SUBMIT_CHOICE.APPROVE_REST)} disabled={saving || !readAll} className={`${btn} bg-success-600`}>
                {label(SUBMIT_CHOICE.APPROVE_REST, 'אשר גם את כל השאר והגש')}
              </button>
            </div>

            <div className="space-y-2 rounded-xl border border-surface-variant p-3">
              <p className="text-xs text-on-surface/70">יוגשו רק התיקונים והפסקאות שאישרתם; השורות שלא אישרתם יישארו לא-מאושרות.</p>
              {opCount === 0 && <p className="text-sm text-danger-700">{SUBMIT_ERRORS.emptyOnly}</p>}
              <button onClick={() => submit(SUBMIT_CHOICE.ONLY_APPROVED)} disabled={saving || opCount === 0} className={`${btn} bg-primary`}>
                {label(SUBMIT_CHOICE.ONLY_APPROVED, 'הגש רק את מה שאישרתי')}
              </button>
            </div>
          </div>
        )}

        <div>
          <label htmlFor={noteId} className="mb-1 block text-sm text-on-surface/70">
            הערה למנהל (לא חובה)
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => onNote?.(e.target.value)}
            maxLength={1000}
            rows={2}
            disabled={saving}
            className="w-full resize-y rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <button onClick={onCancel} disabled={saving} className="rounded-lg border border-surface-variant px-5 py-2 text-on-surface transition-colors hover:bg-surface-variant disabled:opacity-40">
            ביטול
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
