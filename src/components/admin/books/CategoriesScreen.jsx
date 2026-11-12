'use client'

import { useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { FIELD_ERROR } from '@/components/ui/fieldStyles'
import { loginHref } from '@/components/admin/list/adminRequest'
import { booksCountText, formatNumber, normalizeBook } from '@/lib/adminBooks/bookTerms'
import {
  booksByCategory, categorySaveResultText, deleteBlockReason, moveBooksLocally, nameLockReason, newCategoryRow, planCategorySave, toCategoryRows,
} from '@/lib/adminBooks/categories'
import { runLimited } from '@/lib/runLimited'
import { withStopReason } from '@/lib/adminList/bulkText'
import { isFatal } from '@/lib/adminList/requestErrors'
import { unsavedConfirm, useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import BooksHeader from './BooksHeader'
import CategoryRow from './CategoryRow'
import { saveCategories, updateBook } from './booksApi'

/**
 * לשונית "קטגוריות" במסך הספרים: רשימה לעריכה — צבע, שם, כמה ספרים בכל קטגוריה, והסרה — ושמירה אחת
 * בשורה דביקה בתחתית (השרת שומר את הרשימה כולה בבת אחת).
 * שינוי שם של קטגוריה שיש בה ספרים — מעביר גם את הספרים לשם החדש (אחרת היו נשארים עם שם שכבר לא
 * קיים), אחרי אישור שאומר כמה ספרים יעברו. קטגוריה שיש בה ספרים אי אפשר למחוק — הכפתור מושבת,
 * והשורה אומרת למה. "כללי" (ברירת המחדל של השרת לספר חדש) — אי אפשר לשנות לה שם או למחוק אותה, וכתוב
 * את זה בשורה שלה.
 *
 * השמירה: קודם הספרים עוברים לשם החדש (4 בקשות במקביל, עם "X מתוך Y"), ורק אם כולם עברו — נשמרת
 * הרשימה. כשל באמצע — ההודעה אומרת כמה עברו, הרשימה לא נשמרת, ו"שמור" שוב ממשיך מאותו מקום. הספרים
 * שעברו מתעדכנים גם בזיכרון, כך שהמספרים ליד הקטגוריות ומה שמותר למחוק נשארים נכונים בלי רענון.
 * הספרים לא נטענו (initialError) — אין שינוי שם ואין מחיקה של קטגוריה קיימת (לא יודעים מה להעביר).
 *
 * @param {{ initialCategories: { name: string, color?: string }[], initialBooks: any[], initialError?: boolean }} props
 */
export default function CategoriesScreen({ initialCategories, initialBooks, initialError = false }) {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [books, setBooks] = useState(() => (initialBooks || []).map(normalizeBook))
  const usage = useMemo(() => booksByCategory(books), [books])
  const booksKnown = !initialError
  const [saved, setSaved] = useState(() => toCategoryRows(initialCategories))
  const [rows, setRows] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [progress, setProgress] = useState(null) // { done, total } בזמן העברת הספרים
  const plan = planCategorySave(rows, saved, books, { booksKnown })
  const errorsByKey = new Map(plan.errors.filter((e) => e.key).map((e) => [e.key, e.message]))
  const generalErrors = plan.errors.filter((e) => !e.key).map((e) => e.message)

  // שינויים שלא נשמרו — "לצאת בלי לשמור?" בכל קישור (לשוניות, סרגל, כותרת) וב"אחורה", ואזהרת הדפדפן ברענון / סגירה
  useUnsavedChangesGuard(plan.changed || saving, () => confirm(unsavedConfirm('השינויים בקטגוריות לא נשמרו.')))

  const update = (key, patch) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const remove = (key) => setRows((list) => list.filter((r) => r.key !== key))
  const add = () => {
    const row = newCategoryRow()
    setRows((list) => [...list, row])
    requestAnimationFrame(() => document.querySelector(`[data-category-name="${row.key}"]`)?.focus())
  }
  const reset = () => {
    setRows(saved)
    setShowErrors(false)
  }

  const save = async () => {
    if (saving || !plan.changed) return
    if (plan.errors.length > 0) {
      setShowErrors(true)
      return
    }
    const moving = plan.renames.filter((r) => r.bookIds.length > 0)
    if (moving.length > 0) {
      const ok = await confirm({
        title: 'לשנות את שם הקטגוריה?',
        body: 'הספרים שבקטגוריה יעברו לשם החדש:',
        details: moving.map((r) => `"${r.from}" ← "${r.to}" — ${booksCountText(r.bookIds.length)}`),
        confirmLabel: 'שנה שם והעבר',
      })
      if (!ok) return
    }
    setSaving(true)
    const jobs = moving.flatMap((r) => r.bookIds.map((id) => ({ id, to: r.to })))
    const total = jobs.length
    if (total > 0) setProgress({ done: 0, total })
    const run = await runLimited(jobs, (job) => updateBook(job.id, { category: job.to }), {
      limit: 4,
      // אובדן הרשאה או תקלה בשרת — לא מעבירים עוד ספרים (והרשימה לא נשמרת)
      isFatal,
      onProgress: ({ done }) => setProgress({ done, total }),
    })
    const moved = new Map(run.done.map((job) => [job.id, job.to]))
    if (moved.size > 0) setBooks((list) => moveBooksLocally(list, moved))
    let error = run.fatal || run.failed[0]?.error || null
    let listSaved = false
    if (run.done.length === total) {
      try {
        await saveCategories(plan.categories)
        listSaved = true
      } catch (e) {
        error = e
      }
    }
    if (listSaved) {
      const next = toCategoryRows(plan.categories)
      setSaved(next)
      setRows(next)
      setShowErrors(false)
    }
    setProgress(null)
    setSaving(false)

    const result = categorySaveResultText({ total, moved: run.done.length, listSaved })
    const message = listSaved || total > 0 ? result.message : (error?.message || 'לא הצלחנו לשמור את הקטגוריות.')
    toast.show(error?.sessionExpired
      ? { tone: 'error', message: `${message} ${error.message}`, action: { label: 'התחבר', href: loginHref('/library/admin/books/categories') } }
      : { tone: listSaved ? 'success' : 'error', message: run.fatal && total > 0 ? withStopReason(message, run.fatal) : message })
  }

  return (
    <div className="flex flex-col gap-5">
      <BooksHeader tab="categories" />

      {initialError && (
        <p role="alert" className={FIELD_ERROR}>לא הצלחנו לטעון את הספרים — מספר הספרים בכל קטגוריה לא מוצג, ואי אפשר לשנות שם של קטגוריה קיימת או למחוק אותה. אפשר להוסיף קטגוריות ולשנות צבעים. רענן את הדף כדי לנסות שוב.</p>
      )}

      <p className="text-body-sm text-on-surface-variant">
        קטגוריה שיש בה ספרים אי אפשר למחוק — העבר קודם את הספרים לקטגוריה אחרת (במסך הספרים: בחר אותם ← "שנה קטגוריה").
      </p>

      <Card as="div" className="overflow-hidden">
        <ul aria-label="הקטגוריות" className="divide-y divide-outline-variant/60">
          {rows.map((row) => (
            <CategoryRow
              key={row.key}
              row={row}
              count={row.original && booksKnown ? usage.get(row.original)?.length || 0 : null}
              blockReason={!booksKnown && row.original && !deleteBlockReason(row, usage) ? 'הספרים לא נטענו.' : deleteBlockReason(row, usage)}
              nameLock={nameLockReason(row, { booksKnown })}
              error={showErrors ? errorsByKey.get(row.key) : undefined}
              disabled={saving}
              onChange={(patch) => update(row.key, patch)}
              onRemove={() => remove(row.key)}
            />
          ))}
        </ul>
        <div className="border-t border-outline-variant/60 p-2">
          <Button variant="text" size="sm" icon="add" onClick={add} disabled={saving}>הוסף קטגוריה</Button>
        </div>
      </Card>

      {showErrors && generalErrors.map((m) => <p key={m} role="alert" className={FIELD_ERROR}>{m}</p>)}

      <div className="sticky bottom-0 z-(--z-raised) flex flex-wrap items-center justify-end gap-3 border-t border-outline-variant bg-background py-3">
        <p role={progress ? 'status' : undefined} className="me-auto text-body-sm text-on-surface-variant tabular-nums">
          {progress
            ? `מעביר ספרים לשם החדש… ${formatNumber(progress.done)} מתוך ${booksCountText(progress.total)}`
            : plan.changed ? 'יש שינויים שלא נשמרו' : `${formatNumber(rows.length)} קטגוריות`}
        </p>
        <Button variant="text" size="sm" onClick={reset} disabled={!plan.changed || saving}>בטל שינויים</Button>
        <Button variant="filled" size="sm" icon="save" onClick={save} loading={saving} disabled={!plan.changed}>{saving ? 'שומר…' : 'שמור'}</Button>
      </div>

      {confirmElement}
    </div>
  )
}
