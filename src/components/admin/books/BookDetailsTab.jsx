'use client'

import { useId } from 'react'
import ActionList from '@/components/ui/ActionList'
import Button from '@/components/ui/Button'
import ProgressBar from '@/components/ui/ProgressBar'
import RelativeTime from '@/components/ui/RelativeTime'
import { bookOwnership, bookProgress, displayCategory, formatNumber, isPersonal, pagesText, progressText } from '@/lib/adminBooks/bookTerms'
import CategoryLabel from './CategoryLabel'
import { bookDrawerActions, libraryHref } from './bookRowActions'

const DT = 'text-label-md text-on-surface-variant'
const DD = 'text-body-md text-on-surface'

/** "נראות" בפרטים — משפט אחד שאומר מי רואה את הספר (גם בספר אישי) */
function visibilityText(book) {
  if (isPersonal(book)) return book.isHidden ? 'אישי — רק הבעלים ומנהלים רואים אותו' : 'מוצג לכולם'
  return book.isHidden ? 'מוסתר — רק מנהלים רואים אותו' : 'מוצג לכולם'
}

/**
 * לשונית "פרטים" במגירת הספר: ההתקדמות (פס, ומתחת — הושלמו / בעבודה / פנויים), הפרטים (קטגוריה,
 * בעלות, נראות, עמודים, עדכון אחרון), והפעולות: ראשית אחת בולטת ("פתח בספרייה"), ומתחת — רשימה שקטה
 * (ui/ActionList) של אותן פעולות כמו ב-⋮, בקבוצות: עריכה · הורדה · ואחרונה, באדום — "מחק לצמיתות",
 * עם שורה שאומרת מה יימחק. ספר אישי מוסתר: "הצג" מושבת, והשם שלו אומר למה.
 *
 * @param {{ book: any, colorOf: (name: string) => string | null, actions: Record<string, Function>, busy: boolean }} props
 */
export default function BookDetailsTab({ book, colorOf, actions, busy }) {
  const p = bookProgress(book)
  const category = displayCategory(book)
  const ownership = bookOwnership(book)
  const done = p.stage === 'completed'
  const ids = { progress: useId(), meta: useId(), actions: useId(), danger: useId() }
  const items = bookDrawerActions({ book, actions, busy })
  const deleteIndex = items.findIndex((i) => i.id === 'delete')
  const main = items.slice(0, Math.max(0, deleteIndex - 1))
  const destructive = items.slice(deleteIndex)

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby={ids.progress} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={ids.progress} className="text-title-sm text-on-surface">התקדמות</h3>
          {p.total > 0 && (
            <p className="text-body-sm tabular-nums text-on-surface-variant">
              {done ? <span className="text-success">הושלם</span> : `${p.percent}%`}
            </p>
          )}
        </div>
        {p.total > 0 ? (
          <>
            <ProgressBar value={p.completed} max={p.total} labelledBy={ids.progress} valueText={progressText(p)} tone={done ? 'success' : 'primary'} size="md" />
            <dl className="grid grid-cols-3 gap-2 rounded-(--radius-control) bg-surface p-3 text-center">
              <div><dt className={DT}>הושלמו</dt><dd className="text-title-md tabular-nums text-on-surface">{formatNumber(p.completed)}</dd></div>
              <div><dt className={DT}>בעבודה</dt><dd className="text-title-md tabular-nums text-on-surface">{formatNumber(p.inProgress)}</dd></div>
              <div><dt className={DT}>פנויים</dt><dd className="text-title-md tabular-nums text-on-surface">{formatNumber(p.available)}</dd></div>
            </dl>
          </>
        ) : (
          <p className="text-body-md text-on-surface-variant">אין בספר עמודים.</p>
        )}
      </section>

      <section aria-labelledby={ids.meta} className="flex flex-col gap-3">
        <h3 id={ids.meta} className="text-title-sm text-on-surface">פרטים</h3>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-6 gap-y-3">
          <dt className={DT}>קטגוריה</dt>
          <dd className={DD}>{category ? <CategoryLabel name={category} color={colorOf(category)} /> : <span className="text-on-surface-variant">— (ספר אישי)</span>}</dd>
          <dt className={DT}>בעלות</dt>
          <dd className={DD}>{ownership.label}</dd>
          <dt className={DT}>נראות</dt>
          <dd className={DD}>{visibilityText(book)}</dd>
          <dt className={DT}>עמודים</dt>
          <dd className={DD}>{pagesText(p.total)}</dd>
          {book.lastUpdated && (
            <>
              <dt className={DT}>עודכן</dt>
              <dd className={DD}><RelativeTime date={book.lastUpdated} /></dd>
            </>
          )}
        </dl>
      </section>

      <section aria-labelledby={ids.actions} className="flex flex-col gap-3">
        <h3 id={ids.actions} className="text-title-sm text-on-surface">פעולות</h3>
        <Button variant="tonal" size="sm" icon="open_in_new" href={libraryHref(book)} fullWidth>פתח בספרייה</Button>
        <ActionList label={`פעולות על ${book.name}`} items={main} />
      </section>

      <section aria-labelledby={ids.danger} className="flex flex-col gap-2">
        <h3 id={ids.danger} className="sr-only">מחיקה</h3>
        <ActionList label="מחיקה" items={destructive} />
        <p className="px-3 text-body-sm text-on-surface-variant">מחיקה מוחקת את הספר, את כל העמודים שלו ואת הטקסט שנערך. אי אפשר לשחזר.</p>
      </section>
    </div>
  )
}
