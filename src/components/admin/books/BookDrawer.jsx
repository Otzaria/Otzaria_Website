'use client'

import { useCallback, useEffect, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Drawer from '@/components/ui/Drawer'
import Tabs, { tabPanelProps } from '@/components/ui/Tabs'
import ModelTrainingPanel from '@/components/admin/training/ModelTrainingPanel'
import BookOcrPanel from '@/components/admin/ocr/BookOcrPanel'
import { unsavedConfirm, useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { bookOwnership, bookProgress, displayCategory } from '@/lib/adminBooks/bookTerms'
import BookDetailsTab from './BookDetailsTab'
import BookInstructionsTab from './BookInstructionsTab'
import BookPagesTab from './BookPagesTab'
import BookThumb from './BookThumb'
import { useBookDetails } from './useBookDetails'

const TAB_PREFIX = 'book-drawer'
export const DRAWER_TABS = [
  { id: 'details', label: 'פרטים' },
  { id: 'pages', label: 'עמודים' },
  { id: 'instructions', label: 'הנחיות עריכה', shortLabel: 'הנחיות' },
  { id: 'training', label: 'אימון מודלים', shortLabel: 'אימון' },
  { id: 'ocr', label: 'זיהוי טקסט אוטומטי', shortLabel: 'זיהוי טקסט' },
]

/**
 * מגירת הספר — במקום תשעה חלונות נפרדים: כל מה שעושים על ספר אחד, בלשוניות. הכתובת (?book=…&view=…)
 * אומרת מה פתוח, כך שקישור ישיר עובד ו"אחורה" סוגר. הלשוניות:
 *   פרטים — התקדמות, פרטים ופעולות (אותן פעולות כמו ב-⋮ של השורה)
 *   עמודים — מי עובד עכשיו על אילו עמודים, וקישור לכל העמודים בדף הספר
 *   הנחיות עריכה — הטופס (היה "פרטים / עריכת מידע")
 *   זיהוי טקסט אוטומטי — הלוח של OCR לספר שלם (היה חלון נפרד; הלוגיקה לא השתנתה)
 * שינוי שלא נשמר בהנחיות — "לצאת בלי לשמור?" לפני מעבר לשונית וסגירה, ואזהרת הדפדפן ברענון או בסגירת
 * הלשונית (useUnsavedChangesGuard). "אחורה" בדפדפן — אצל המסך (onDirtyChange), שמשאיר את המגירה ושואל.
 *
 * מה נשאר בחלון (ui/Dialog) ולא במגירה: פעולות קצרות עם החלטה אחת — שינוי שם, הצגה לכולם (האם לשלוח
 * הודעה), מיזוג (כמה ספרים, ולא אחד), מחיקה (אישור). הם נפתחים מעל המגירה.
 *
 * @param {{ book: any, view: string, onView: (view: string) => void, onClose: () => void, colorOf: (name: string) => string | null,
 *   actions: Record<string, Function>, busy: boolean, toast: any, confirm: Function, returnFocus?: () => HTMLElement | null,
 *   onDirtyChange?: (dirty: boolean) => void }} props
 */
export default function BookDrawer({ book, view, onView, onClose, colorOf, actions, busy, toast, confirm, returnFocus, onDirtyChange: reportDirty }) {
  const [dirty, setDirty] = useState(false)
  const details = useBookDetails(book.path, view === 'pages' || view === 'instructions')
  const onDirtyChange = useCallback((next) => setDirty(next), [])
  useEffect(() => {
    reportDirty?.(dirty)
  }, [dirty, reportDirty])
  useEffect(() => () => reportDirty?.(false), [reportDirty])
  const { guardLeave } = useUnsavedChangesGuard(dirty, () => confirm(unsavedConfirm('השינויים בהנחיות העריכה לא נשמרו.')), { trapBack: false })

  const changeView = async (next) => {
    if (next === view) return
    if (view === 'instructions' && !(await guardLeave())) return
    onView(next)
  }
  const close = async () => {
    if (await guardLeave()) onClose()
  }

  const p = bookProgress(book)
  const category = displayCategory(book)
  const ownership = bookOwnership(book)

  return (
    <Drawer
      title={book.name}
      subtitle={(
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{[category, ownership.label].filter(Boolean).join(' · ')}</span>
          {book.isHidden && <Badge icon="visibility_off">מוסתר</Badge>}
          {p.stage === 'completed' && <Badge tone="success" icon="task_alt">הושלם</Badge>}
        </span>
      )}
      leading={<BookThumb src={book.thumbnail} size="lg" className="mt-1" />}
      onClose={close}
      returnFocus={returnFocus}
      header={<Tabs label={`הלשוניות של ${book.name}`} idPrefix={TAB_PREFIX} items={DRAWER_TABS} value={view} onChange={changeView} className="px-2 sm:px-4" />}
    >
      <div {...tabPanelProps(TAB_PREFIX, view)} className="outline-none">
        {view === 'details' && <BookDetailsTab book={book} colorOf={colorOf} actions={actions} busy={busy} />}
        {view === 'pages' && <BookPagesTab book={book} details={details} />}
        {view === 'instructions' && (
          <BookInstructionsTab
            book={book}
            details={details}
            toast={toast}
            onDirtyChange={onDirtyChange}
          />
        )}
        {view === 'training' && <ModelTrainingPanel book={book} />}
        {view === 'ocr' && <BookOcrPanel book={book} />}
      </div>
    </Drawer>
  )
}
