'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppIcon from './AppIcon'
import Button from './Button'
import { cx } from './cx'
import { FOCUS_RING, FOCUS_RING_INSET } from './focusRing'
import { usePortalContainer } from './portalContainer'
import { useDialogA11y } from './useDialogA11y'
import { placeMenu } from './selectMenuGeometry'
import { edgeIndex, filterOptions, moveIndex, selectedValues, summaryText, toggleValue, typeaheadIndex } from './selectMenuModel'

/**
 * בורר מעוצב — במקום <select> של הדפדפן: כפתור שפותח רשימה (listbox) של אפשרויות, עם בחירה אחת
 * או כמה, חיפוש ברשימה ארוכה, מונה ליד כל אפשרות, נקודת צבע, ✓ על הנבחרות ו"נקה".
 *
 * צורות הכפתור (variant):
 *   field  — שדה בסרגל סינון, עם תווית גלויה מעליו (ומסגרת primary כשיש בחירה)
 *   quiet  — טקסט שקט עם חץ (מיון)
 *   tag    — תג קטן ברוחב התוכן, בלי מסגרת (מצב הספר בשורה)
 *   action — פעולה (טקסט primary, "שנה מצב"); הבחירה מפעילה ולא נשמרת
 *
 * במחשב — רשימה צפה ליד הכפתור, בתוך המסך (selectMenuGeometry). בטלפון (<640px) — גיליון תחתון
 * ברוחב מלא, עם כותרת, ובבחירה מרובה "נקה" ו"סיום"; לכידת פוקוס ונעילת גלילה כמו בדיאלוג.
 *
 * מקלדת (דפוס combobox/listbox של ARIA): על הכפתור ↓ ↑ Enter רווח פותחים, ואות פותחת ומתחילה
 * לחפש. ברשימה ↑ ↓ Home End PageUp PageDown זזים, Enter בוחר (באחת — ונסגר; בכמה — מסמן ונשאר),
 * רווח מסמן (כשאין שדה חיפוש), הקלדה מסננת (בחיפוש) או קופצת לאפשרות (בלי חיפוש), Esc סוגר,
 * ו-Tab סוגר וממשיך הלאה מהכפתור. הפוקוס נשאר בשדה החיפוש (או ברשימה), והאפשרות הפעילה מסומנת
 * ב-aria-activedescendant. אחרי בחירה או Esc הפוקוס חוזר לכפתור.
 *
 * forced-colors: מסגרת לרשימה ולכפתורים בלי מסגרת, והאפשרות הפעילה במסגרת Highlight.
 *
 * @param {{
 *   label: string, hideLabel?: boolean, options: import('./selectMenuModel').SelectOption[],
 *   value: string | string[] | null, onChange: (value: any) => void, multiple?: boolean,
 *   searchable?: boolean, searchPlaceholder?: string, placeholder?: string, allLabel?: string | null,
 *   variant?: 'field' | 'quiet' | 'tag' | 'action', icon?: string, triggerText?: string, title?: string,
 *   disabled?: boolean, emptyText?: string, className?: string, triggerClassName?: string, textClassName?: string,
 *   highlight?: boolean, labelSize?: 'md' | 'lg'
 * }} props
 * labelSize — גודל התווית ב-field: md (ברירת מחדל — סרגלי סינון), lg — בטופס, כמו שאר השדות (fieldStyles.FIELD_LABEL),
 * כך שבורר ושדה טקסט זה מתחת לזה מקבלים אותה תווית.
 * highlight — ב-field: מתי המסגרת primary. ברירת מחדל: כשיש בחירה (סרגל סינון — "יש סינון פעיל"). בטופס יש
 * תמיד ערך, ולכן שם מעבירים מה שמתאים (למשל: הערך שונה מהשמור), כדי שהבורר לא ייראה תמיד "בפוקוס".
 * אפשרות עם description — שורת הסבר קטנה מתחת לשם (מימין לשמאל, נשברת; hint — לטקסט משמאל לימין).
 * value — בבחירה אחת מחרוזת (או null / ''), בכמה — מערך. allLabel — באחת: אפשרות "הכול" (ערך '')
 * בראש הרשימה. placeholder — מה שכתוב על הכפתור כשאין בחירה. triggerText — טקסט קבוע לכפתור
 * (action). searchable — ברירת מחדל: יותר מ-8 אפשרויות. textClassName — לטקסט שעל הכפתור (למשל
 * להסתיר אותו בשורה צרה ולהשאיר אייקון; השם הנגיש נשאר מהתווית). ב-action הוא חל גם על החץ — כשהטקסט
 * מוסתר, גם החץ (כפתור אייקון בלבד, כמו שאר הפעולות בשורה).
 */
export default function SelectMenu({
  label,
  hideLabel = false,
  labelSize = 'md',
  options,
  value,
  onChange,
  multiple = false,
  searchable,
  searchPlaceholder = 'חפש ברשימה',
  placeholder = 'הכול',
  allLabel = null,
  variant = 'field',
  icon,
  triggerText,
  title,
  disabled = false,
  emptyText = 'לא נמצאו אפשרויות',
  className,
  triggerClassName,
  textClassName,
  highlight,
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const ids = { label: `sm-${uid}-label`, value: `sm-${uid}-value`, list: `sm-${uid}-list`, search: `sm-${uid}-search`, trigger: `sm-${uid}-trigger` }
  const triggerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [seed, setSeed] = useState('')

  const values = selectedValues(value, multiple)
  // בחירה מרובה: הערך האחרון ששלחנו — שתי בחירות מהירות (לפני שההורה מחזיר את הערך החדש, למשל
  // דרך הכתובת) לא דורסות זו את זו. מתעדכן כשמגיע ערך חדש מבחוץ.
  const latest = useRef(values)
  useEffect(() => {
    latest.current = selectedValues(value, multiple)
  }, [value, multiple])
  const allOptions = useMemo(
    () => (!multiple && allLabel !== null ? [{ value: '', label: allLabel }, ...options] : options),
    [multiple, allLabel, options]
  )
  const showSearch = searchable ?? options.length > 8
  const summary = triggerText ?? summaryText(options, values, placeholder)
  const current = !multiple && values.length === 1 ? options.find((o) => o.value === values[0]) : null
  const active = variant === 'field' && (highlight ?? values.length > 0)

  const close = useCallback((refocus) => {
    setOpen(false)
    setSeed('')
    if (refocus) triggerRef.current?.focus({ preventScroll: true })
  }, [])

  const openMenu = (initial = '') => {
    if (disabled) return
    setSeed(initial)
    setOpen(true)
  }

  const commit = (next) => {
    if (multiple) {
      latest.current = toggleValue(options, latest.current, next)
      onChange(latest.current)
      return
    }
    close(true)
    if (variant === 'action' || next !== (values[0] ?? '')) onChange(next)
  }

  // מקש שהבורר טיפל בו לא ממשיך הלאה: בדפים יש קיצורי מקלדת על window (Enter = שמירה, אותיות
  // וספרות = פעולה על השורה), ו-Enter / אות על הבורר נועדו רק לו
  const onTriggerKeyDown = (event) => {
    if (open || disabled) return
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      event.stopPropagation()
      openMenu()
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
      // אות על הכפתור: פותחת, ומתחילה לחפש / לקפוץ באותה אות
      event.preventDefault()
      event.stopPropagation()
      openMenu(event.key)
    }
  }

  return (
    <div className={cx('min-w-0', variant === 'field' ? 'flex flex-col' : 'inline-flex', className)}>
      <span id={ids.label} className={hideLabel || variant !== 'field' ? 'sr-only' : cx('mb-2 block text-on-surface', labelSize === 'lg' ? 'text-label-lg' : 'text-label-md')}>
        {label}
      </span>
      <button
        ref={triggerRef}
        id={ids.trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? ids.list : undefined}
        aria-labelledby={variant === 'action' ? ids.label : `${ids.label} ${ids.value}`}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        title={variant === 'tag' ? summary : undefined}
        className={cx(TRIGGER[variant], triggerState(variant, { active, open }), triggerClassName)}
      >
        {icon && <AppIcon name={icon} className="shrink-0 text-icon-lg" />}
        {current?.color && <ColorDot color={current.color} />}
        <span id={ids.value} className={cx('min-w-0 flex-1 truncate text-start', textClassName)}>{summary}</span>
        <AppIcon
          name="expand_more"
          className={cx('shrink-0 transition-transform motion-reduce:transition-none', variant === 'tag' ? 'text-icon-md' : 'text-icon-lg', variant !== 'action' && 'text-on-surface-variant', variant === 'action' && textClassName, open && 'rotate-180')}
        />
      </button>

      {open && (
        <SelectMenuPopup
          ids={ids}
          label={label}
          title={title || label}
          options={allOptions}
          values={multiple ? values : [values[0] ?? (allLabel !== null ? '' : undefined)].filter((v) => v !== undefined)}
          multiple={multiple}
          showSearch={showSearch}
          searchPlaceholder={searchPlaceholder}
          emptyText={emptyText}
          seed={seed}
          triggerRef={triggerRef}
          onCommit={commit}
          onClear={() => {
            latest.current = []
            onChange([])
          }}
          onClose={close}
        />
      )}
    </div>
  )
}

const TRIGGER = {
  field: cx(
    'flex min-h-(--field-height-md) w-full cursor-pointer items-center gap-2 rounded-(--field-radius) border bg-(--field-bg) ps-4 pe-3 text-body-md text-(--field-fg) transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-(--button-disabled-opacity)',
    'focus-visible:border-(--field-border-focus) focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-(--field-border-focus)'
  ),
  quiet: cx(
    'inline-flex min-h-(--touch-target) max-w-full cursor-pointer items-center gap-1 rounded-(--radius-control) ps-2 pe-1 text-label-md text-on-surface',
    'disabled:cursor-not-allowed disabled:opacity-(--button-disabled-opacity)',
    FOCUS_RING
  ),
  // תג שקט: ברוחב התוכן, משטח טונלי בלי מסגרת; מסגרת דקה רק בריחוף. מטרת המגע 44px — דרך ::before
  tag: cx(
    "relative inline-flex h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-(--radius-pill) border bg-surface-container ps-2.5 pe-1.5 text-label-md text-on-surface transition-colors",
    "before:absolute before:inset-x-0 before:top-1/2 before:h-(--touch-target) before:-translate-y-1/2 before:content-['']",
    'disabled:cursor-not-allowed disabled:opacity-(--button-disabled-opacity) forced-colors:border-[ButtonText]',
    FOCUS_RING
  ),
  action: cx(
    'inline-flex min-h-(--touch-target) cursor-pointer items-center gap-1.5 rounded-(--radius-control) px-3 text-label-lg text-primary',
    'disabled:cursor-not-allowed disabled:opacity-(--button-disabled-opacity)',
    FOCUS_RING
  ),
}

/** צבע המסגרת / המשטח לפי מצב — מחלקה אחת לכל תכונה (cx לא ממזג מחלקות סותרות) */
function triggerState(variant, { active, open }) {
  if (variant === 'field') return active || open ? 'border-primary' : 'border-(--field-border) hover:border-(--field-border-hover)'
  if (variant === 'tag') return open ? 'border-outline-variant' : 'border-transparent hover:border-outline-variant'
  return open ? 'bg-surface-selected' : 'hover:bg-surface-selected'
}

/** נקודת הצבע של מצב — מזהה בלבד (השם תמיד כתוב); נעלמת ב-forced-colors */
function ColorDot({ color }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full forced-colors:hidden"
      style={{ backgroundColor: color, boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-shadow) 15%, transparent)' }}
    />
  )
}

const SHEET_QUERY = '(max-width: 639.98px)'
const MENU_MIN_WIDTH = 224
const MENU_MAX_WIDTH = 384
const MENU_MAX_HEIGHT = 416
const TYPEAHEAD_MS = 600

function SelectMenuPopup({ ids, label, title, options, values, multiple, showSearch, searchPlaceholder, emptyText, seed, triggerRef, onCommit, onClear, onClose }) {
  const container = usePortalContainer()
  // הצורה נקבעת בפתיחה: טלפון — גיליון; אחרת — רשימה צפה
  const [sheet] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(SHEET_QUERY).matches))
  const [query, setQuery] = useState(showSearch ? seed : '')
  const shown = useMemo(() => filterOptions(options, query), [options, query])
  const [activeIndex, setActiveIndex] = useState(() => {
    if (!showSearch && seed) {
      const hit = typeaheadIndex(options, seed, -1)
      if (hit >= 0) return hit
    }
    const selected = options.findIndex((o) => values.includes(o.value))
    return selected >= 0 && !(showSearch && seed) ? selected : edgeIndex(options, false)
  })
  const active = Math.min(activeIndex, shown.length - 1)
  const listRef = useRef(null)
  const searchRef = useRef(null)
  const panelRef = useRef(null)
  // מה שהוקלד לקפיצה, ומתי (הזמן של האות שפתחה את הרשימה — בפתיחה, למטה)
  const typeahead = useRef({ buffer: seed && !showSearch ? seed : '', at: 0 })
  const [pos, setPos] = useState(null)

  // פוקוס פנימה: לשדה החיפוש, או לרשימה עצמה — רק אחרי שהמיקום חושב: לפני כן הרשימה הצפה
  // visibility:hidden (נמדדת), ואי אפשר למקד בה (הפוקוס היה נשאר על הכפתור, וההקלדה הולכת לאיבוד)
  const focusedIn = useRef(false)
  useLayoutEffect(() => {
    if (focusedIn.current || (!sheet && !pos)) return
    focusedIn.current = true
    typeahead.current.at = Date.now()
    ;(searchRef.current || listRef.current)?.focus({ preventScroll: true })
  }, [sheet, pos])

  // האפשרות הפעילה — בתוך שטח הגלילה
  useEffect(() => {
    if (active < 0) return
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active, pos])

  // מיקום (רק ברשימה צפה): ליד הכפתור, ומתעדכן בגלילה ובשינוי גודל; לחיצה בחוץ סוגרת
  const place = useCallback(() => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return
    const rect = trigger.getBoundingClientRect()
    const rtl = getComputedStyle(trigger).direction !== 'ltr'
    // הגובה הטבעי: מה שמסביב לרשימה + כל הרשימה (גם החלק שנגלל כרגע)
    const list = listRef.current
    const natural = panel.offsetHeight - (list?.clientHeight || 0) + (list?.scrollHeight || 0)
    const next = placeMenu({
      trigger: rect,
      menu: { width: panel.scrollWidth, height: natural },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rtl,
      minWidth: MENU_MIN_WIDTH,
      maxWidth: MENU_MAX_WIDTH,
      maxHeight: Math.min(MENU_MAX_HEIGHT, window.innerHeight * 0.7),
    })
    setPos((prev) => (prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.maxHeight === next.maxHeight ? prev : next))
  }, [triggerRef])

  useLayoutEffect(() => {
    if (!sheet) place()
  }, [sheet, place])

  useEffect(() => {
    if (sheet) return undefined
    const onDown = (event) => {
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return
      onClose(false)
    }
    const onScroll = (event) => {
      if (panelRef.current?.contains(event.target)) return
      place()
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [sheet, place, onClose, triggerRef])

  const choose = (index) => {
    const option = shown[index]
    if (!option || option.disabled) return
    setActiveIndex(index)
    onCommit(option.value)
  }

  const onKeyDown = (event) => {
    // כל מקש ברשימה הפתוחה שייך לה — לא מגיע למאזיני המקלדת של הדף (Enter ששומר, ספרה שמאשרת
    // שורה, אות שמדלגת). חוץ מ-Tab: לכידת הפוקוס של הגיליון / החלון שמסביב צריכה אותו.
    // (קיצורי הדפדפן עצמו, כמו Ctrl+F, לא מושפעים — רק מאזינים בדף.)
    if (event.key !== 'Tab') event.stopPropagation()
    const inSearch = event.target === searchRef.current
    const move = (index) => {
      event.preventDefault()
      if (index >= 0) setActiveIndex(index)
    }
    switch (event.key) {
      case 'ArrowDown': return move(active < 0 ? edgeIndex(shown, false) : moveIndex(shown, active, 1))
      case 'ArrowUp': return move(active < 0 ? edgeIndex(shown, true) : moveIndex(shown, active, -1))
      case 'PageDown': return move(moveIndex(shown, Math.max(active, 0), 10))
      case 'PageUp': return move(moveIndex(shown, Math.max(active, 0), -10))
      case 'Home':
      case 'End':
        // בשדה חיפוש עם טקסט — Home/End מזיזים את הסמן בטקסט, כרגיל
        if (inSearch && query) return undefined
        return move(edgeIndex(shown, event.key === 'End'))
      case 'Enter':
        event.preventDefault()
        if (active >= 0) choose(active)
        return undefined
      case ' ':
        if (inSearch) return undefined
        event.preventDefault()
        if (active >= 0) choose(active)
        return undefined
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        onClose(true)
        return undefined
      case 'Tab': {
        if (sheet) return undefined
        // יציאה מהרשימה (Tab מהפקד האחרון בה / Shift+Tab מהראשון): סוגרים, הפוקוס חוזר לכפתור,
        // וה-Tab עצמו (בלי preventDefault) ממשיך משם לפקד הבא בדף
        const focusables = [...panelRef.current.querySelectorAll('input, button:not([disabled]), [tabindex="0"]')]
        const index = focusables.indexOf(document.activeElement)
        const leaving = event.shiftKey ? index <= 0 : index === focusables.length - 1
        if (leaving) onClose(true)
        return undefined
      }
      default:
        break
    }
    // הקלדה ברשימה בלי חיפוש — קפיצה לאפשרות שמתחילה במה שהוקלד
    if (!inSearch && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now()
      const t = typeahead.current
      t.buffer = now - t.at > TYPEAHEAD_MS ? event.key : t.buffer + event.key
      t.at = now
      const hit = typeaheadIndex(shown, t.buffer, active)
      if (hit >= 0) move(hit)
    }
    return undefined
  }

  const activeId = active >= 0 && shown[active] ? `${ids.list}-${active}` : undefined
  const list = (
    <ul
      ref={listRef}
      id={ids.list}
      role="listbox"
      aria-labelledby={ids.label}
      aria-multiselectable={multiple || undefined}
      aria-activedescendant={showSearch ? undefined : activeId}
      tabIndex={showSearch ? -1 : 0}
      className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 outline-none', !showSearch && 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary')}
    >
      {shown.map((option, index) => {
        const selected = values.includes(option.value)
        return (
          <li
            key={option.value}
            id={`${ids.list}-${index}`}
            data-index={index}
            role="option"
            aria-selected={selected}
            aria-disabled={option.disabled || undefined}
            onPointerMove={() => { if (index !== active) setActiveIndex(index) }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
            className={cx(
              'flex min-h-(--touch-target) cursor-pointer select-none items-center gap-3 rounded-(--radius-control) px-3 py-2 text-body-md text-on-surface',
              // forced-colors: מסגרת ולא רקע — על רקע Highlight הדפדפן מצייר מאחורי הטקסט "לוח" בצבע Canvas, והטקסט נעלם
              index === active && 'bg-surface-selected forced-colors:outline-2 forced-colors:-outline-offset-2 forced-colors:outline-[Highlight]',
              option.disabled && 'cursor-not-allowed opacity-40'
            )}
          >
            <CheckMark selected={selected} multiple={multiple} />
            {option.color && <ColorDot color={option.color} />}
            <span className="min-w-0 flex-1 break-words">
              {option.label}
              {option.hint && <bdi dir="ltr" className="block truncate text-end text-body-sm text-on-surface-variant">{option.hint}</bdi>}
              {option.description && <span className="block text-body-sm text-on-surface-variant">{option.description}</span>}
            </span>
            {typeof option.count === 'number' && (
              <span className="shrink-0 text-body-sm text-on-surface-variant tabular-nums">{option.count.toLocaleString('he-IL')}</span>
            )}
          </li>
        )
      })}
      {shown.length === 0 && <li role="presentation" className="px-3 py-4 text-center text-body-sm text-on-surface-variant">{emptyText}</li>}
    </ul>
  )

  const search = showSearch && (
    <div className="relative shrink-0 border-b border-outline-variant p-1.5">
      <span aria-hidden="true" className="pointer-events-none absolute start-4 top-1/2 flex -translate-y-1/2 text-on-surface-variant">
        <AppIcon name="search" className="text-icon-lg" />
      </span>
      <input
        ref={searchRef}
        id={ids.search}
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={ids.list}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-label={`${searchPlaceholder}: ${label}`}
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={searchPlaceholder}
        onChange={(event) => {
          setQuery(event.target.value)
          setActiveIndex(0)
        }}
        className="block min-h-(--touch-target) w-full rounded-(--radius-control) bg-surface-container-low ps-10 pe-3 text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-2 focus:-outline-offset-2 focus:outline-primary"
      />
    </div>
  )

  const footer = multiple && (
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-outline-variant p-1.5">
      <Button variant="text" size="sm" icon="close" disabled={values.length === 0} onClick={onClear}>נקה</Button>
      <Button variant={sheet ? 'filled' : 'text'} size="sm" onClick={() => onClose(true)}>סיום</Button>
    </div>
  )

  if (!container) return null
  if (sheet) {
    return createPortal(
      <SelectSheet title={title} onClose={() => onClose(true)} onKeyDown={onKeyDown} panelRef={panelRef}>
        {search}
        {list}
        {footer}
      </SelectSheet>,
      container
    )
  }
  return createPortal(
    <div
      ref={panelRef}
      dir="rtl"
      onKeyDown={onKeyDown}
      style={pos ? { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight } : { left: 0, top: 0, width: 'max-content', maxWidth: MENU_MAX_WIDTH, visibility: 'hidden' }}
      className="fixed z-(--z-overlay) flex flex-col overflow-hidden rounded-(--radius-container) bg-surface text-on-surface shadow-menu forced-colors:border forced-colors:border-[CanvasText] animate-[enter-fade_var(--motion-duration-fast)_var(--ease-enter)_backwards] motion-reduce:animate-none"
    >
      {search}
      {list}
      {footer}
    </div>,
    container
  )
}

/** ✓ בבחירה אחת; תיבה עם ✓ בבחירה מרובה (כך שרואים מראש שאפשר לסמן כמה) */
function CheckMark({ selected, multiple }) {
  if (multiple) {
    return (
      <span
        aria-hidden="true"
        className={cx(
          'flex size-5 shrink-0 items-center justify-center rounded-(--radius-xs) border-2',
          selected ? 'border-primary bg-primary text-on-primary' : 'border-outline'
        )}
      >
        {selected && <AppIcon name="check" className="text-icon-sm" />}
      </span>
    )
  }
  return (
    <span aria-hidden="true" className="flex w-5 shrink-0 justify-center text-primary">
      {selected && <AppIcon name="check" className="text-icon-lg" />}
    </span>
  )
}

/** הגיליון התחתון בטלפון: רקע מוחשך, ידית וכותרת; לכידת פוקוס, Esc ונעילת גלילה — useDialogA11y */
function SelectSheet({ title, onClose, onKeyDown, panelRef, children }) {
  const titleId = useId()
  useDialogA11y(panelRef, onClose)
  return (
    <div data-select-sheet="" className="fixed inset-0 z-(--z-overlay) flex items-end">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-(--dialog-scrim) animate-[enter-fade_var(--motion-duration-standard)_var(--ease-enter)_backwards] motion-reduce:animate-none" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        dir="rtl"
        onKeyDown={onKeyDown}
        className="relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-(--dialog-sheet-radius) bg-surface pb-[env(safe-area-inset-bottom)] text-on-surface shadow-(--dialog-sheet-shadow) outline-none forced-colors:border forced-colors:border-[CanvasText] animate-[enter-up_var(--motion-duration-standard)_var(--ease-enter)_backwards] motion-reduce:animate-none"
      >
        <div className="relative shrink-0 px-14 pb-2 pt-3 text-center">
          <span aria-hidden="true" className="mx-auto mb-2 block h-1 w-10 rounded-(--radius-pill) bg-outline-variant" />
          <h2 id={titleId} className="text-title-md text-on-surface">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className={cx('absolute end-2 top-1.5 flex size-(--touch-target) items-center justify-center rounded-(--radius-control) text-on-surface-variant hover:bg-surface-selected', FOCUS_RING_INSET)}
          >
            <AppIcon name="close" className="text-icon-xl" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
