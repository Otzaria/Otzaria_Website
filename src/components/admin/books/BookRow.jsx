'use client'

import { memo } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import Checkbox from '@/components/ui/Checkbox'
import MenuButton from '@/components/ui/MenuButton'
import { cx } from '@/components/ui/cx'
import { bookOwnership, displayCategory } from '@/lib/adminBooks/bookTerms'
import BookProgress from './BookProgress'
import BookThumb from './BookThumb'
import CategoryLabel from './CategoryLabel'
import { bookMenuItems } from './bookRowActions'
import OpenChip from '@/components/admin/list/OpenChip'
import {
  AREA_BOOK, AREA_CHECK, AREA_CONTROLS, AREA_MENU, AREA_PRIMARY, AREA_PROGRESS, AREA_THUMB, ROW_GRID, ROW_PADDING,
} from './bookRowLayout'

/**
 * שורת ספר ברשימה: בחירה, כריכה, שם (ותג "מוסתר" — רק הוא מסומן; גלוי הוא ברירת המחדל), שורת פרטים
 * (קטגוריה עם נקודת צבע · בעלות), התקדמות, "פתח" (המגירה) ו-⋮ לשאר.
 * לחיצה על השם פותחת גם היא (נוחות לעכבר; למקלדת ולקורא המסך — "פתח").
 * busy — יש בקשה פתוחה על הספר: הפקדים מושבתים (בלי בקשה כפולה).
 *
 * @param {{ book: any, colorOf: (name: string) => string | null, selected: boolean,
 *   onSelect: (ids: string[], checked: boolean) => void, onOpen: (book: any) => void,
 *   actions: Record<string, (...args: any[]) => void>, busy?: boolean }} props
 */
function BookRow({ book, colorOf, selected, onSelect, onOpen, actions, busy = false }) {
  const category = displayCategory(book)
  const ownership = bookOwnership(book)
  return (
    <li data-row={book.id} className={cx('transition-colors', selected && 'bg-surface-selected')}>
      <div className={cx(ROW_GRID, ROW_PADDING)}>
        <div className={AREA_CHECK}>
          <Checkbox data-row-focus="" label={`בחר את ${book.name}`} checked={selected} onChange={(checked) => onSelect([book.id], checked)} />
        </div>

        <div className={AREA_THUMB}>
          <BookThumb src={book.thumbnail} />
        </div>

        <div className={AREA_BOOK}>
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-title-sm text-on-surface">
            {/* לחיצה על השם פותחת (עכבר); הפקד הנגיש — "פתח" */}
            <span className="cursor-pointer break-words hover:text-primary" onClick={() => onOpen(book)}>{book.name}</span>
            {book.isHidden && <Badge icon="visibility_off" className="@max-2xl:hidden">מוסתר</Badge>}
          </h3>
          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 text-body-sm text-on-surface-variant">
            {/* ברשימה צרה התג עובר לשורת הפרטים — כדי שלא יתפוס שורה משלו (שורה של כ-90px בטלפון) */}
            {book.isHidden && (
              <>
                <span className="inline-flex items-center gap-0.5 @2xl:hidden"><AppIcon name="visibility_off" className="text-icon-sm" />מוסתר</span>
                <span aria-hidden="true" className="@2xl:hidden">·</span>
              </>
            )}
            {category && <CategoryLabel name={category} color={colorOf(category)} />}
            {/* ברשימה צרה "ציבורי" (ברירת המחדל) לא נכתב — רק בעלות שאינה ציבורית, כדי שהשורה לא תישבר */}
            {category && <span aria-hidden="true" className={cx(ownership.kind === 'public' && '@max-2xl:hidden')}>·</span>}
            <span className={cx('min-w-0 truncate', ownership.kind === 'public' && '@max-2xl:sr-only')}>{ownership.label}</span>
          </p>
        </div>

        <div className={AREA_CONTROLS}>
          <div className={AREA_PROGRESS}>
            <BookProgress book={book} />
          </div>
          <div className={AREA_PRIMARY}>
            <OpenChip onClick={() => onOpen(book)} disabled={busy} label={`פתח את ${book.name}`} />
          </div>
        </div>

        <div className={AREA_MENU}>
          <MenuButton label={`פעולות נוספות: ${book.name}`} items={bookMenuItems({ book, actions, busy })} />
        </div>
      </div>
    </li>
  )
}

export default memo(BookRow)
