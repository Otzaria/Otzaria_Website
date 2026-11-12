'use client'

import { memo, useMemo } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import MenuButton from '@/components/ui/MenuButton'
import { cx } from '@/components/ui/cx'
import { UNDO_SHORTCUT } from '@/components/ui/Toast'
import { fullDateText } from '@/lib/adminTerms'
import {
  NO_DATE_TEXT, NO_DATE_TITLE, OUTDATED_LINE, RELEASED_LINE, RELEASE_HINT, RELEASE_PENDING_LINE, STATUS_TONES, editorHref, formatNumber, pageLabel,
  statusLabel, updatedAgoText, workerText,
} from '@/lib/adminPagesScreen/pageTerms'
import {
  AREA_CHECK, AREA_MAIN, AREA_MENU, AREA_NUMBER, AREA_PRIMARY, AREA_STATUS, AREA_SUB, AREA_UPDATED, AREA_USER, BOOK_NAME, ROW_GRID, ROW_PADDING,
} from './pageRowLayout'

/**
 * "לפני 12 ימים", והתאריך המלא בריחוף. בלי תאריך — "לא ידוע" (עם הסבר: נחשב ותיק). עמוד ששונה במסך — "עכשיו".
 * suppressHydrationWarning — "היום" יכול להשתנות בין השרת לדפדפן.
 */
function Updated({ page }) {
  if (page.changedHere) return <span>עכשיו</span>
  const text = updatedAgoText(page.updatedAt)
  if (!text) return <span title={NO_DATE_TITLE}>{NO_DATE_TEXT}</span>
  return <time dateTime={new Date(page.updatedAt).toISOString()} title={fullDateText(page.updatedAt)} suppressHydrationWarning>{text}</time>
}

/** במקום "שחרר", בעמוד ששוחרר במסך (עד הרענון הבא): סימון שקט באותו מקום, לא כפתור */
function ReleasedMark() {
  return (
    <span className="inline-flex min-h-(--touch-target) items-center gap-1.5 px-3 text-label-lg text-on-surface-variant">
      <AppIcon name="check" className="text-icon-md" />
      {RELEASED_LINE}
    </span>
  )
}

/**
 * שורת עמוד: בחירה, שם הספר, מספר העמוד, מצב, מי עובד עליו, מתי עודכן, "שחרר" (רק בעמוד בעבודה) ו-⋮ ("הורד טקסט",
 * "פתח בעורך", "שנה מצב…"). ברשימה צרה — שם הספר בשורה משלו (נשבר), ומתחתיו הפרטים ו"שחרר".
 * releasing — השחרור ממתין ל"בטל": במקום "שחרר" — "בטל" (באותו גודל ובאותה צורה), ובמקום "עודכן" — "ישוחרר בעוד
 * כמה שניות". busy — הבקשה באוויר (הבדיקה והשחרור). עמוד ששוחרר / שונה במסך — נשאר במקומו, עם "שוחרר" / "עכשיו".
 * hideStatus — ברשימה צרה, כשמסננים לפי המצב הזה: התג חוזר בכל שורה בלי לחדש (חוץ משורה שהמצב שלה השתנה).
 * גם עמוד בעבודה — בלי תג בשורה הצרה: "שחרר" לידו אומר את זה, והמקום נחוץ לשם המתנדב (לקורא המסך — בטקסט נסתר).
 * memo: כל ה-props יציבים (פונקציות מ-useCallback, ערכים פשוטים) — שורה מתרנדרת רק כשמשהו שלה השתנה.
 *
 * @param {{ page: any, selected: boolean, onSelect: (ids: string[], checked: boolean) => void, releasing: boolean,
 *   busy: boolean, locked: boolean, hideStatus?: string, onRelease: (page: any) => void, onCancelRelease: (page: any) => void,
 *   onDownload: (page: any) => void, onChangeStatus: (page: any) => void }} props
 * locked — פעולה מרובה באמצע: הבחירה, "שחרר" ו"שנה מצב" נעולים.
 */
function PageRow({ page, selected, onSelect, releasing, busy, locked, hideStatus = '', onRelease, onCancelRelease, onDownload, onChangeStatus }) {
  const name = `${page.bookName}, ${pageLabel(page.number)}`
  const worker = workerText(page)
  // הבדיקה לפני שליחה מצאה שהעמוד השתנה, אבל לא מה המצב החדש (בדיקה לפי מצב, בפעולה על הרבה ספרים)
  const working = page.status === 'in-progress' && !page.outdated
  // בשורת הפרטים הצרה: עמוד בעבודה — "שחרר" לידו כבר אומר את זה (והמקום נחוץ לשם המתנדב); מצב שמסננים לפיו — חוזר
  // בכל שורה בלי לחדש. שורה שהמצב שלה השתנה כאן — התג מוצג.
  const showSubStatus = page.changedHere || (page.status !== 'in-progress' && (!hideStatus || page.status !== hideStatus))
  const menuItems = useMemo(() => [
    { id: 'download', icon: 'download', label: 'הורד טקסט', disabled: busy, onSelect: () => onDownload(page) },
    { id: 'editor', icon: 'open_in_new', label: 'פתח בעורך', onSelect: () => window.open(editorHref(page), '_blank', 'noopener') },
    { id: 'status', icon: 'edit_note', label: 'שנה מצב…', disabled: busy || locked || releasing, onSelect: () => onChangeStatus(page) },
  ], [page, busy, locked, releasing, onDownload, onChangeStatus])
  const when = releasing ? RELEASE_PENDING_LINE : page.outdated ? OUTDATED_LINE : null

  return (
    <li data-row={page.id} className={cx(ROW_GRID, ROW_PADDING, 'relative transition-colors', selected && 'bg-surface-selected')}>
      <div className={AREA_CHECK}>
        <Checkbox label={`בחר את ${name}`} checked={selected} disabled={locked || releasing} onChange={(checked) => onSelect([page.id], checked)} />
      </div>

      <div className={AREA_MAIN}>
        <h3 title={page.bookName} className={BOOK_NAME}>
          {page.bookName}
          {/* ברשימה צרה — מספר העמוד ליד השם (הוא חלק מהזהות של השורה); ברוחב — בעמודה משלו, ולקורא המסך כאן */}
          <span className="whitespace-nowrap text-body-md font-normal text-on-surface-variant @4xl:sr-only">, {pageLabel(page.number)}</span>
        </h3>
      </div>

      {/* ברשימה צרה: מצב · מתי · מי — הזמן לפני השם, כך שהשם (ולא הזמן) הוא שנחתך */}
      <div className={AREA_SUB}>
        {showSubStatus
          ? <Badge tone={STATUS_TONES[page.status] || 'neutral'} className="shrink-0">{statusLabel(page.status)}</Badge>
          : <span className="sr-only">{statusLabel(page.status)}</span>}
        <span className="shrink-0 text-body-sm text-on-surface-variant">{when || <Updated page={page} />}</span>
        {worker && <span title={worker} className="min-w-0 truncate text-body-sm text-on-surface-variant"><span aria-hidden="true">· </span>{worker}</span>}
      </div>

      <p aria-hidden="true" className={AREA_NUMBER}>{formatNumber(page.number)}</p>
      <div className={AREA_STATUS}><Badge tone={STATUS_TONES[page.status] || 'neutral'}>{statusLabel(page.status)}</Badge></div>
      <p className={AREA_USER} title={worker || undefined}>
        {worker ? <><span className="sr-only">עובד עליו: </span>{worker}</> : <span aria-hidden="true" className="text-on-surface-variant">—</span>}
      </p>
      <p className={AREA_UPDATED}>
        {when || <><span className="sr-only">עודכן </span><Updated page={page} /></>}
      </p>

      <div className={AREA_PRIMARY}>
        {releasing ? (
          <Button
            data-cancel-release=""
            variant="text"
            size="sm"
            icon="undo"
            onClick={() => onCancelRelease(page)}
            aria-label={`בטל את השחרור: ${name}`}
            aria-keyshortcuts={UNDO_SHORTCUT}
            title="בטל (Ctrl+Z)"
          >
            בטל
          </Button>
        ) : working ? (
          <Button
            data-release=""
            variant="text"
            size="sm"
            icon="lock_open"
            loading={busy}
            softDisabled={locked}
            onClick={() => onRelease(page)}
            aria-label={`שחרר: ${name}`}
            title={RELEASE_HINT}
          >
            שחרר
          </Button>
        ) : page.releasedHere ? <ReleasedMark /> : null}
      </div>
      <div data-row-menu="" className={AREA_MENU}>
        <MenuButton label={`פעולות נוספות: ${name}`} items={menuItems} />
      </div>
    </li>
  )
}

export default memo(PageRow)

/** כותרות העמודות — רק ברשימה רחבה; לקורא המסך כל תא אומר מה הוא (sr-only), ולכן aria-hidden */
export function PageColumnsHeader() {
  return (
    <div aria-hidden="true" className={cx(ROW_GRID, ROW_PADDING, 'hidden min-h-11 border-b border-outline-variant/60 py-1 text-label-md text-on-surface-variant @4xl:grid')}>
      <span className="[grid-area:main]">ספר</span>
      <span className="[grid-area:number]">עמוד</span>
      <span className="[grid-area:status]">מצב</span>
      <span className="[grid-area:user]">משתמש</span>
      <span className="[grid-area:updated]">עודכן</span>
    </div>
  )
}
