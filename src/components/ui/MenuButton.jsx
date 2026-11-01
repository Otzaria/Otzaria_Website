'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppIcon from './AppIcon'
import Button from './Button'
import Tooltip from './Tooltip'
import Kbd from './Kbd'
import { cx } from './cx'
import { FOCUS_RING_INSET } from './focusRing'
import { usePortalContainer } from './portalContainer'

/**
 * כפתור אייקון שפותח תפריט פעולות (role="menu"). התפריט מרונדר בפורטל (position: fixed), כך
 * שמכל עם overflow מוסתר — שורת כלים שלא נגללת — לא חותך אותו.
 *
 * מקלדת: Enter/רווח/↓ על הכפתור פותחים ומעבירים פוקוס לפריט הראשון (אחרי שמיקום התפריט חושב —
 * לא כשהוא עוד visibility:hidden); ↑↓ Home End בתוך התפריט — וגם כשנפתח בעכבר והפוקוס מחוצה לו
 * (המקש הראשון נכנס לתפריט); Esc סוגר תמיד (מאזין capture במסמך כל עוד התפריט פתוח, כך שגם
 * כשהפוקוס נשאר בעורך — keepFocus — Esc לא מגיע לעורך) ומחזיר את הפוקוס לכפתור אם הוא היה
 * בתפריט או בכפתור; Tab ולחיצה מחוץ לתפריט סוגרים. הרמז של הכפתור מוסתר כל עוד התפריט פתוח.
 * keepFocus — לחיצת עכבר לא לוקחת את הפוקוס מהעורך (הסמן והבחירה ב-textarea נשמרים).
 * size — גודל הכפתור (Button); בשורות הכלים של העורך "tool" (וגם רמז קומפקטי).
 *
 * @typedef {{ id: string, label: string, icon?: string, glyph?: string, shortcut?: string[],
 *   disabled?: boolean, pressed?: boolean, radio?: boolean, mirror?: boolean, glyphClassName?: string, onSelect: () => void } | { separator: true, id?: string }} MenuItem
 *   pressed — פריט מצב (menuitemcheckbox, aria-checked); radio — בחירה אחת מקבוצה (menuitemradio);
 *   mirror — אייקון כיווני שמתהפך ב-RTL (ביטול/ביצוע מחדש).
 *
 * @param {{ icon?: string, label: string, tip?: string, items: MenuItem[], keepFocus?: boolean,
 *   className?: string, menuLabel?: string, size?: 'sm'|'tool', keyshortcuts?: string }} props
 */
export default function MenuButton({ icon = 'more_vert', label, tip, items, keepFocus = false, className, menuLabel, size = 'sm', keyshortcuts }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const portalContainer = usePortalContainer()
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const restoreFocusRef = useRef(false)
  // האלמנט שהיה ממוקד כשהמקלדת נכנסה לתפריט שנפתח בעכבר (keepFocus — העורך): לשם חוזרים בסגירה
  const outsideFocusRef = useRef(/** @type {HTMLElement|null} */ (null))
  const uid = useId()
  const menuId = `menu-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`

  const close = useCallback((refocus) => {
    setOpen(false)
    setPos(null)
    const outside = outsideFocusRef.current
    outsideFocusRef.current = null
    // הפוקוס בתפריט שעומד להיעלם ונכנס אליו מבחוץ (העורך) — חוזר לשם, ולא נופל ל-body
    if (outside?.isConnected && menuRef.current?.contains(document.activeElement)) outside.focus()
    else if (refocus) triggerRef.current?.querySelector('button')?.focus()
  }, [])

  const menuItems = () => [...(menuRef.current?.querySelectorAll('[role^="menuitem"]:not([aria-disabled="true"])') ?? [])]

  // מיקום: מתחת לכפתור, מיושר לקצה הסוף שלו (ב-RTL — השמאלי), ונשאר בתוך המסך
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current?.getBoundingClientRect()
    const menu = menuRef.current
    if (!trigger || !menu) return
    const width = menu.offsetWidth
    const height = menu.offsetHeight
    const rtl = getComputedStyle(triggerRef.current).direction !== 'ltr'
    const preferred = rtl ? trigger.left : trigger.right - width
    const left = Math.max(8, Math.min(preferred, window.innerWidth - width - 8))
    const below = trigger.bottom + 4
    const top = below + height > window.innerHeight - 8 && trigger.top - height - 4 > 8 ? trigger.top - height - 4 : below
    setPos({ left, top })
  }, [open])

  // פוקוס לפריט הראשון — רק אחרי שהמיקום חושב (לפני כן התפריט visibility:hidden ואי אפשר למקד בו)
  useEffect(() => {
    if (open && pos && restoreFocusRef.current) menuItems()[0]?.focus()
  }, [open, pos])

  useEffect(() => {
    if (!open) return undefined
    // Esc וחיצים ברמת המסמך (capture): גם כשהפוקוס לא בתפריט (נפתח בעכבר; keepFocus — בעורך)
    const onKey = (event) => {
      const inMenu = menuRef.current?.contains(document.activeElement)
      const onTrigger = triggerRef.current?.contains(document.activeElement)
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close(inMenu || onTrigger || restoreFocusRef.current)
        return
      }
      if (inMenu) return
      const list = menuItems()
      if (!list.length) return
      const active = /** @type {HTMLElement|null} */ (document.activeElement)
      if (['ArrowDown', 'Home', 'ArrowUp', 'End'].includes(event.key) && !onTrigger && active && active !== document.body) {
        outsideFocusRef.current = active
      }
      if (event.key === 'ArrowDown' || event.key === 'Home') {
        event.preventDefault()
        event.stopPropagation()
        list[0].focus()
      } else if (event.key === 'ArrowUp' || event.key === 'End') {
        event.preventDefault()
        event.stopPropagation()
        list[list.length - 1].focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    const onDown = (event) => {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return
      close(false)
    }
    const onScrollOrResize = () => close(false)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, close])

  const openMenu = (byKeyboard) => {
    restoreFocusRef.current = byKeyboard
    setOpen(true)
  }

  const onMenuKeyDown = (event) => {
    const list = menuItems()
    const index = list.indexOf(document.activeElement)
    const move = (next) => {
      event.preventDefault()
      list[(next + list.length) % list.length]?.focus()
    }
    if (event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowUp') move(index < 0 ? list.length - 1 : index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(list.length - 1)
    else if (event.key === 'Tab') close(false)
  }

  const choose = (item) => {
    if (item.disabled) return
    close(restoreFocusRef.current)
    item.onSelect()
  }

  return (
    <span ref={triggerRef} className={cx('inline-flex', className)}>
      <Tooltip content={tip || label} compact={size === 'tool'} suppressed={open}>
        <Button
          variant="text"
          size={size}
          iconOnly
          icon={icon}
          aria-label={label}
          aria-keyshortcuts={keyshortcuts}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          className={open ? (size === 'tool' ? 'bg-(--tool-bg-hover)' : 'bg-surface-selected') : undefined}
          onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
          onClick={() => (open ? close(false) : openMenu(false))}
          onKeyDown={(event) => {
            if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              openMenu(true)
            }
          }}
        />
      </Tooltip>
      {open && portalContainer && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menuLabel || label}
          dir="rtl"
          onKeyDown={onMenuKeyDown}
          style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
          className="fixed z-(--z-overlay) max-h-[min(70dvh,32rem)] min-w-56 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-(--radius-container) bg-surface p-1.5 text-on-surface shadow-menu"
        >
          {items.map((item, index) => (
            'separator' in item && item.separator
              ? <div key={item.id || `sep-${index}`} role="separator" className="mx-2 my-1 h-px bg-outline-variant" />
              : <MenuRow key={item.id} item={item} keepFocus={keepFocus} onChoose={choose} />
          ))}
        </div>,
        portalContainer
      )}
    </span>
  )
}

function MenuRow({ item, keepFocus, onChoose }) {
  return (
    <button
      type="button"
      role={item.pressed === undefined ? 'menuitem' : item.radio ? 'menuitemradio' : 'menuitemcheckbox'}
      aria-checked={item.pressed === undefined ? undefined : Boolean(item.pressed)}
      tabIndex={-1}
      aria-disabled={item.disabled || undefined}
      onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
      onClick={() => onChoose(item)}
      className={cx(
        'flex min-h-(--touch-target) w-full items-center gap-3 rounded-(--radius-control) px-3 text-start text-body-sm',
        item.disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-surface-selected focus-visible:bg-surface-selected',
        item.pressed && 'bg-surface-selected',
        FOCUS_RING_INSET
      )}
    >
      <span aria-hidden="true" className="flex w-6 shrink-0 justify-center text-on-surface-variant">
        {item.icon
          ? <AppIcon name={item.icon} className={cx('text-xl', item.mirror && 'rtl:-scale-x-100')} />
          : <span dir="ltr" className={cx('text-label-md [unicode-bidi:isolate]', item.glyphClassName || 'font-light')}>{item.glyph}</span>}
      </span>
      <span className="min-w-0 flex-1">{item.label}</span>
      {item.shortcut && item.shortcut.length > 0 && <Kbd keys={item.shortcut} decorative className="text-label-sm text-on-surface-variant" />}
    </button>
  )
}
