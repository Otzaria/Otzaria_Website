'use client'

import { useEffect, useId, useState } from 'react'
import Button from '@/components/ui/Button'
import ErrorState from '@/components/ui/ErrorState'
import Skeleton from '@/components/ui/Skeleton'
import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { loginHref } from '@/components/admin/list/adminRequest'
import {
  bookInstructionsPayload, newSectionForm, parseExamplePage, sameSections, toBookInstructionsForm, untitledSectionKeys,
} from '@/lib/adminBooks/instructions'
import InstructionSectionsEditor from './InstructionSectionsEditor'
import { saveBookInstructions } from './booksApi'

/**
 * לשונית "הנחיות עריכה" במגירת הספר: כותרת, עמוד דוגמה, וסעיפים (כותרת + שורה לכל הנחיה). מה שהיה
 * "פרטים / עריכת מידע" בחלון נפרד. השמירה — בשורה דביקה בתחתית; "שמור" מושבת כשאין שינוי.
 * onDirtyChange — כדי שהמגירה תשאל "לצאת בלי לשמור?" לפני מעבר לשונית או סגירה.
 * מקור הנתון — הספר שנטען מהשרת (details), ולא הרשימה (שלא מחזיקה את ההנחיות). אחרי שמירה הנתון
 * שנטען מתעדכן (details.patch) — כך שחזרה ללשונית מציגה את מה שנשמר, ולא את הישן.
 *
 * @param {{ book: any, details: any, toast: any, onDirtyChange: (dirty: boolean) => void }} props
 */
export default function BookInstructionsTab({ book, details, toast, onDirtyChange }) {
  if (details.status === 'error') {
    return details.error?.sessionExpired ? (
      <ErrorState title="פג תוקף ההתחברות" description="התחבר מחדש כדי לערוך את ההנחיות." action={<Button href={loginHref()} variant="filled" size="sm" icon="login">התחבר</Button>} />
    ) : (
      <ErrorState title="לא הצלחנו לטעון את ההנחיות" description={details.error?.message} onRetry={details.retry} />
    )
  }
  if (details.status !== 'ready') {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <p role="status" className="sr-only">טוען את ההנחיות…</p>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  return (
    <InstructionsForm
      key={book.id}
      book={book}
      info={details.data.book?.editingInfo ?? null}
      examplePage={details.data.book?.examplePage ?? null}
      toast={toast}
      onSaved={details.patch}
      onDirtyChange={onDirtyChange}
    />
  )
}

function InstructionsForm({ book, info, examplePage, toast, onSaved, onDirtyChange }) {
  const [saved, setSaved] = useState(() => toBookInstructionsForm(info, examplePage))
  const [title, setTitle] = useState(saved.title)
  const [sections, setSections] = useState(saved.sections)
  const [pageText, setPageText] = useState(saved.examplePage ? String(saved.examplePage) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ids = { title: useId(), titleHint: useId(), page: useId(), pageHint: useId(), pageError: useId() }
  const page = parseExamplePage(pageText, book.totalPages)
  const untitled = untitledSectionKeys(sections)
  const dirty = title.trim() !== saved.title.trim() || !sameSections(sections, saved.sections) || (page.error ? true : page.value !== saved.examplePage)

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const save = async () => {
    if (saving || !dirty || page.error) return
    setSaving(true)
    setError('')
    const form = { title, sections, examplePage: page.value }
    const payload = bookInstructionsPayload(form)
    try {
      await saveBookInstructions(book.id, payload)
      setSaved({ title: payload.editingInfo.title, sections, examplePage: page.value })
      setTitle(payload.editingInfo.title)
      onSaved({ editingInfo: payload.editingInfo, examplePage: page.value })
      toast.show({ message: 'ההנחיות נשמרו' })
    } catch (e) {
      setError(e?.message || 'לא הצלחנו לשמור את ההנחיות.')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setTitle(saved.title)
    setSections(saved.sections)
    setPageText(saved.examplePage ? String(saved.examplePage) : '')
    setError('')
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save() }}>
      <p className="text-body-sm text-on-surface-variant">ההנחיות מופיעות למי שעורך עמוד בספר, מעל ההנחיות הכלליות.</p>
      <div>
        <label htmlFor={ids.title} className={FIELD_LABEL}>כותרת ההנחיות</label>
        <input id={ids.title} type="text" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} aria-describedby={ids.titleHint} className={fieldClasses()} placeholder="למשל: הנחיות עריכה — תלמוד" />
        <p id={ids.titleHint} className={FIELD_HINT}>מופיעה למי שעורך עמוד בספר, מעל כל הסעיפים.</p>
      </div>
      <div>
        <label htmlFor={ids.page} className={FIELD_LABEL}>עמוד דוגמה</label>
        <input
          id={ids.page}
          type="text"
          inputMode="numeric"
          value={pageText}
          onChange={(e) => setPageText(e.target.value)}
          disabled={saving}
          aria-invalid={Boolean(page.error) || undefined}
          aria-describedby={page.error ? ids.pageError : ids.pageHint}
          className={fieldClasses({ invalid: Boolean(page.error), className: 'max-w-40 tabular-nums' })}
        />
        {page.error
          ? <p id={ids.pageError} role="alert" className={FIELD_ERROR}>{page.error}</p>
          : <p id={ids.pageHint} className={FIELD_HINT}>עמוד שמראה איך עמוד ערוך צריך להיראות. ריק — בלי עמוד דוגמה.</p>}
      </div>

      <InstructionSectionsEditor
        sections={sections}
        onChange={setSections}
        disabled={saving}
        untitled={untitled}
        onAdd={() => setSections((s) => [...s, newSectionForm()])}
        requireTitle
      />

      {error && <p role="alert" className={FIELD_ERROR}>{error}</p>}

      <div className="sticky -bottom-5 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-outline-variant bg-background px-4 py-3 sm:-mx-6 sm:px-6">
        {dirty && <p className="me-auto text-body-sm text-on-surface-variant">יש שינויים שלא נשמרו</p>}
        <Button variant="text" size="sm" onClick={reset} disabled={!dirty || saving}>בטל שינויים</Button>
        <Button type="submit" variant="filled" size="sm" icon="save" loading={saving} disabled={!dirty || Boolean(page.error)}>{saving ? 'שומר…' : 'שמור'}</Button>
      </div>
    </form>
  )
}
