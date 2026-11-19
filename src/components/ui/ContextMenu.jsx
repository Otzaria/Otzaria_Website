'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppIcon from './AppIcon'
import Kbd from './Kbd'
import { cx } from './cx'
import { FOCUS_RING_INSET } from './focusRing'
import { usePortalContainer } from './portalContainer'
import { contextMenuPosition } from './contextMenuGeometry'
import { useOutsidePress } from '@/hooks/useOutsidePress'

/**
 * תפריט הקשר (לחיצה ימנית) בנקודה x/y במסך — אותו מראה כמו התפריט של ui/MenuButton.
 * ההורה מרנדר אותו רק כשהוא פתוח, ומסיר אותו ב-onClose.
 *
 * מיקום: contextMenuPosition — בימין-לשמאל משמאל לנקודה, מתהפך כשאין מקום, ותמיד בתוך המסך.
 * מקלדת: הפוקוס נכנס לפריט הפעיל הראשון; ↑↓ Home End בין הפריטים (גם המושבתים — כדי שקורא המסך
 * יקריא את ההסבר שלהם, אבל Enter עליהם לא עושה כלום); Enter/רווח בוחרים; Esc ו-Tab סוגרים.
 * סגירה: גם בלחיצה מחוץ לתפריט, בגלילה ובשינוי גודל החלון.
 * onClose(reason) — 'select' | 'escape' | 'tab' | 'outside' | 'dismiss'. על ההורה להחזיר את הפוקוס
 * (למשל לשדה הטקסט) — חוץ מ-'outside', שבה הלחיצה עצמה כבר קובעת לאן הפוקוס הולך.
 * בבחירה: קודם onClose('select') ואחר כך onSelect של הפריט — כך הפוקוס כבר חזר כשהפעולה רצה.
 *
 * @typedef {{ id: string, label: string, icon?: string, shortcut?: string[], disabled?: boolean,
 *   hint?: string | readonly string[], onSelect?: () => void } | { separator: true, id: string }} ContextMenuItem
 *   hint — שורה קטנה מתחת לתווית (למשל למה הפריט מושבת), או כמה שורות נפרדות (מערך); מחוברת ב-aria-describedby
 *
 * @param {{ x: number, y: number, items: ContextMenuItem[], onClose: (reason: string) => void,
 *   label: string, footer?: import('react').ReactNode }} props
 */
export default function ContextMenu({ x, y, items, onClose, label, footer }) {
  const container = usePortalContainer()
  const menuRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [pos, setPos] = useState(/** @type {{ left: number, top: number } | null} */ (null))
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  const close = useCallback((reason) => closeRef.current?.(reason), [])

  const rows = () => [...(menuRef.current?.querySelectorAll('[role="menuitem"]') ?? [])]

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const rtl = getComputedStyle(menu).direction !== 'ltr'
    setPos(contextMenuPosition({
      x, y, width: menu.offsetWidth, height: menu.offsetHeight,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, rtl
    }))
  }, [x, y, container])

  // פוקוס לפריט הפעיל הראשון — אחרי שהמיקום חושב (לפני כן התפריט visibility:hidden)
  useEffect(() => {
    if (!pos) return
    const list = rows()
    const first = list.find((el) => el.getAttribute('aria-disabled') !== 'true') || list[0]
    first?.focus({ preventScroll: true })
  }, [pos])

  const outside = useOutsidePress(true, () => close('outside'))

  useEffect(() => {
    const onScroll = (event) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return
      close('dismiss')
    }
    const onResize = () => close('dismiss')
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('blur', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('blur', onResize)
    }
  }, [close])

  const onKeyDown = (event) => {
    const list = rows()
    const index = list.indexOf(/** @type {HTMLElement} */ (document.activeElement))
    const move = (next) => {
      event.preventDefault()
      list[(next + list.length) % list.length]?.focus()
    }
    if (event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowUp') move(index < 0 ? list.length - 1 : index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(list.length - 1)
    else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close('escape')
    } else if (event.key === 'Tab') {
      event.preventDefault()
      close('tab')
    }
  }

  const choose = (item) => {
    if (item.disabled) return
    close('select')
    item.onSelect?.()
  }

  if (!container) return null
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      aria-describedby={footer ? `${uid}-footer` : undefined}
      dir="rtl"
      data-context-menu=""
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDownCapture={outside.onPointerDownCapture}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      className="fixed z-(--z-overlay) max-h-[min(80dvh,34rem)] w-max min-w-60 max-w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-(--radius-container) bg-surface p-1.5 text-on-surface shadow-menu"
    >
      {items.map((item, index) => (
        'separator' in item && item.separator
          ? <div key={item.id || `sep-${index}`} role="separator" className="mx-2 my-1 h-px bg-outline-variant" />
          : <ContextMenuRow key={item.id} item={item} baseId={`${uid}-${item.id}`} onChoose={choose} />
      ))}
      {footer && <div id={`${uid}-footer`} className="mx-2 mt-1 border-t border-outline-variant px-1 pb-1 pt-2 text-label-sm text-on-surface-variant">{footer}</div>}
    </div>,
    container
  )
}

function ContextMenuRow({ item, baseId, onChoose }) {
  const hintId = `${baseId}-hint`
  const labelId = `${baseId}-label`
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={item.disabled || undefined}
      // השם — התווית בלבד; ההסבר (hint) — תיאור נפרד
      aria-labelledby={labelId}
      aria-describedby={item.hint ? hintId : undefined}
      // לחיצת עכבר לא מוציאה את הפוקוס לפני הבחירה (הבחירה מחזירה אותו לשדה)
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onChoose(item)}
      className={cx(
        'flex min-h-(--touch-target) w-full items-center gap-3 rounded-(--radius-control) px-3 py-1.5 text-start text-body-sm',
        item.disabled ? 'cursor-not-allowed' : 'hover:bg-surface-selected focus-visible:bg-surface-selected',
        'focus:bg-surface-selected',
        FOCUS_RING_INSET
      )}
    >
      <span aria-hidden="true" className={cx('flex w-6 shrink-0 justify-center text-on-surface-variant', item.disabled && 'opacity-40')}>
        {item.icon ? <AppIcon name={item.icon} className="text-icon-lg" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span id={labelId} className={cx('block', item.disabled && 'opacity-40')}>{item.label}</span>
        {item.hint && (
          <span id={hintId} className="block text-label-sm text-on-surface-variant">
            {Array.isArray(item.hint) ? item.hint.map((line) => <span key={line} className="block">{line}</span>) : item.hint}
          </span>
        )}
      </span>
      {item.shortcut && item.shortcut.length > 0 && (
        <Kbd keys={item.shortcut} decorative className={cx('text-label-sm text-on-surface-variant', item.disabled && 'opacity-40')} />
      )}
    </button>
  )
}
