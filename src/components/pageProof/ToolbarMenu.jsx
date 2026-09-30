'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { isKey } from '@/lib/pageProof/keys'

// תפריט נפתח לסרגל-כלים (סגנון-פסקה, זרם לשורות). נפתח בלחיצה או במקלדת
// (Enter / רווח / ↓ על הכפתור); ↑↓ Home End בתוך התפריט, Enter בוחר, Esc
// סוגר ומחזיר את הפוקוס לכפתור; לחיצה מחוץ לתפריט סוגרת. לחיצת-עכבר אינה
// לוקחת את הפוקוס מהעורך — הסמן והבחירה בטקסט נשמרים לפעולה.
//
// items: [{key, label (ReactNode), hint?, color?, checked?, disabled?}] או
// {separator:true}. כשלפחות לפריט אחד יש checked — התפריט הוא "בחירה אחת"
// (menuitemradio) ומסומן ✓ ליד הנבחר.

const preventFocusLoss = (e) => e.preventDefault()

export default function ToolbarMenu({
  label,
  title,
  ariaLabel,
  disabled = false,
  items = [],
  onSelect,
  heading = null,
  triggerClassName = '',
  menuClassName = 'w-56',
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [byKeyboard, setByKeyboard] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const itemRefs = useRef([])
  const uid = useId()
  const menuId = `menu-${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`

  const selectable = (k) => !!items[k] && !items[k].separator && !items[k].disabled
  const radio = items.some((it) => it && Object.hasOwn(it, 'checked'))
  const step = (from, delta) => {
    const n = items.length
    for (let k = 1; k <= n; k++) {
      const idx = (((from + delta * k) % n) + n) % n
      if (selectable(idx)) return idx
    }
    return -1
  }

  const openMenu = (keyboard) => {
    if (disabled || !items.length) return
    const cur = items.findIndex((it, k) => it?.checked && selectable(k))
    setActive(cur >= 0 ? cur : step(-1, 1))
    setByKeyboard(keyboard)
    setOpen(true)
  }

  const close = (refocus) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  const choose = (k) => {
    if (!selectable(k)) return
    close(byKeyboard)
    onSelect?.(items[k].key)
  }

  // לחיצה מחוץ לתפריט / Esc — סגירה
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (!isKey(e, 'Escape')) return
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      if (byKeyboard) triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, byKeyboard])

  // במקלדת — הפוקוס על הפריט המסומן
  useEffect(() => {
    if (open && byKeyboard && active >= 0) itemRefs.current[active]?.focus()
  }, [open, byKeyboard, active])

  const onMenuKey = (e) => {
    if (isKey(e, 'ArrowDown') || isKey(e, 'ArrowUp')) {
      e.preventDefault()
      setByKeyboard(true)
      setActive((a) => step(a, isKey(e, 'ArrowDown') ? 1 : -1))
    } else if (isKey(e, 'Home') || isKey(e, 'End')) {
      e.preventDefault()
      setByKeyboard(true)
      setActive(isKey(e, 'Home') ? step(-1, 1) : step(items.length, -1))
    } else if (isKey(e, 'Tab')) {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onMouseDown={preventFocusLoss}
        onClick={() => (open ? setOpen(false) : openMenu(false))}
        onKeyDown={(e) => {
          if (isKey(e, 'ArrowDown') || isKey(e, 'Enter') || isKey(e, 'Space')) {
            e.preventDefault()
            openMenu(true)
          }
        }}
        className={`flex h-7 items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white ${
          open ? 'bg-neutral-50 ring-1 ring-neutral-300' : ''
        } ${triggerClassName}`}
      >
        {label}
        <span className="material-symbols-outlined text-sm text-neutral-500" aria-hidden="true">expand_more</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={ariaLabel || title}
          onKeyDown={onMenuKey}
          className={`absolute start-0 top-full z-40 mt-1 rounded-md border border-neutral-200 bg-white py-1 text-on-surface shadow-lg ${menuClassName}`}
        >
          {heading && <div className="border-b border-neutral-100 px-3 pb-1.5 pt-1 text-[11px] leading-snug text-on-surface/60">{heading}</div>}
          {items.map((it, k) =>
            it.separator ? (
              <div key={`sep-${k}`} role="separator" className="my-1 h-px bg-neutral-200" />
            ) : (
              <button
                key={it.key}
                ref={(el) => {
                  itemRefs.current[k] = el
                }}
                type="button"
                role={radio ? 'menuitemradio' : 'menuitem'}
                aria-checked={radio ? !!it.checked : undefined}
                aria-disabled={it.disabled || undefined}
                tabIndex={k === active ? 0 : -1}
                title={it.title}
                onMouseDown={preventFocusLoss}
                onMouseEnter={() => setActive(k)}
                onClick={() => choose(k)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-right text-xs outline-none transition-colors ${
                  k === active ? 'bg-neutral-100' : ''
                } ${it.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
              >
                {radio && (
                  <span className="w-4 shrink-0 text-center">
                    {it.checked && <span className="material-symbols-outlined text-sm text-primary" aria-hidden="true">check</span>}
                  </span>
                )}
                {it.color && <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} aria-hidden="true" />}
                <span className="min-w-0 flex-1">{it.label}</span>
                {it.hint && <span className="shrink-0 text-[10px] text-on-surface/50">{it.hint}</span>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
