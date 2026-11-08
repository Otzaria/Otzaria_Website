'use client'

import { memo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import ExpandToggle from '@/components/ui/ExpandToggle'
import MenuButton from '@/components/ui/MenuButton'
import Skeleton from '@/components/ui/Skeleton'
import RelativeTime from '@/components/ui/RelativeTime'
import DiffPreview from '@/components/library/DiffPreview'
import { CONFLICT_PANEL_HINT, KEEP_LABELS, conflictBookName, conflictPartsText } from '@/lib/adminSuggestions/conflictTerms'
import { useConflictParts } from './useConflictParts'

/** המזהה של שורת הספר — להעברת פוקוס כשהספר יוצא מהרשימה */
export const conflictRowId = (id) => `conflict-${id}`

/**
 * ספר עם התנגשות: שם, קטגוריה ומתי נמצאה; מספר החלקים השונים הוא כפתור הפתיחה (צ'יפ שקט עם חץ). פתיחה —
 * ההבדלים (נטענים רק עכשיו), שורת הסבר עם "פתח בעורך" גלוי (הפעולה הבטוחה — לא בתפריט שרובו הרסני), ולכל
 * חלק "השאר את הנוסח שבמאגר" / "השאר את הנוסח שבאתר", עם כמה שניות של "בטל" (useConflictParts).
 * ⋮: פתח בעורך, ואחרי מפריד, באדום — אותן שתי פעולות על כל הספר (עם חלון אישור, אצל ההורה).
 *
 * @param {{ book: any, busy: boolean, onResolved: (bookId: string, data: any) => void, onError: (error: any) => void,
 *   onResolveBook: (book: any, strategy: 'ours' | 'theirs') => void }} props
 */
function ConflictBookRow({ book, busy, onResolved, onError, onResolveBook }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const parts = useConflictParts(book, { onResolved, onError })
  const name = conflictBookName(book)
  const panelId = `conflict-${book._id}-parts`
  const editorHref = `/library/dicta-edit/${book._id}`

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && !parts.loaded && !parts.loading) parts.load()
  }

  // פעולה על כל הספר: בחירות בחלקים שעוד לא יצאו — מתבטלות (הן היו נדרסות ממילא)
  const resolveBook = (strategy) => {
    parts.cancelWaiting()
    onResolveBook(book, strategy)
  }

  const menuItems = [
    { id: 'open', icon: 'edit', label: 'פתח בעורך', onSelect: () => router.push(editorHref) },
    { separator: true, id: 'sep' },
    { id: 'ours', icon: 'public', label: `${KEEP_LABELS.ours} בכל הספר`, danger: true, disabled: busy, onSelect: () => resolveBook('ours') },
    { id: 'theirs', icon: 'cloud_sync', label: `${KEEP_LABELS.theirs} בכל הספר`, danger: true, disabled: busy, onSelect: () => resolveBook('theirs') },
  ]

  return (
    <Card as="li" id={conflictRowId(book._id)} data-conflict-row="" tabIndex={-1} aria-labelledby={`${panelId}-title`} className="flex min-w-0 flex-col gap-3 p-3 outline-none focus-visible:outline-2 focus-visible:outline-primary sm:p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 ps-1">
          <h3 id={`${panelId}-title`} className="text-title-md text-on-surface [overflow-wrap:anywhere]">{name}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-on-surface-variant">
            {book.category && <span>{book.category}</span>}
            {book.category && book.detectedAt && <span aria-hidden="true">·</span>}
            {book.detectedAt && <RelativeTime date={book.detectedAt} prefix="נמצאה" />}
            <ExpandToggle
              label={book.conflictCount > 0 ? conflictPartsText(book.conflictCount) : 'ההבדלים'}
              expanded={open}
              controls={open ? panelId : undefined}
              onToggle={toggle}
              ariaLabel={`${open ? 'הסתר' : 'הצג'} את ההבדלים: ${name}`}
              className="ms-1"
            />
          </p>
        </div>
        <MenuButton label={`פעולות: ${name}`} items={menuItems} />
      </div>

      {open && (
        <div id={panelId} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="min-w-0 flex-1 basis-64 text-body-sm text-on-surface-variant">{CONFLICT_PANEL_HINT}</p>
            <Button href={editorHref} variant="text" size="sm" icon="edit">פתח בעורך</Button>
          </div>
          {parts.loading && (
            <div aria-busy="true" className="flex flex-col gap-2">
              <p role="status" className="sr-only">טוען את ההבדלים…</p>
              <Skeleton className="h-28 w-full" />
            </div>
          )}
          {!parts.loading && parts.error && (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-body-sm text-error">
              <span>{parts.error.message || 'לא הצלחנו לטעון את ההבדלים.'}</span>
              <Button variant="text" size="sm" icon="refresh" onClick={parts.load}>נסה שוב</Button>
            </div>
          )}
          {!parts.loading && !parts.error && parts.loaded && (
            <DiffPreview changes={parts.changes} total={parts.changeCount} onResolve={parts.resolvePart} decisions={parts.decisions} onCancel={parts.cancelPart} />
          )}
        </div>
      )}
    </Card>
  )
}

export default memo(ConflictBookRow)
