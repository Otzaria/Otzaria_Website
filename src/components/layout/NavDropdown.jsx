'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'

/**
 * פריט ניווט שנפתח לרשימת קישורים (בכותרת העליונה, בדסקטופ) — דפוס disclosure נגיש:
 * כפתור עם aria-expanded/aria-controls ורשימת קישורים רגילה (לא role="menu" — אלה ניווט).
 *
 * מתי פתוח:
 * - ריחוף בעכבר — גם ב-CSS לבד (.nav-dropdown:hover ב-styles/nav.css), כך שגם HTML סטטי
 *   בלי React מציג אותו. הסגירה מושהית מעט ב-CSS, כדי שמעבר אלכסוני לרשימה לא "יפיל" אותה;
 *   והרשימה צמודה לכפתור דרך ריפוד שקוף, בלי רווח שבו הריחוף נקטע;
 * - פוקוס מקלדת על הכפתור (focus-visible) — Tab ממשיך ישר אל הקישורים שבתוכה;
 * - לחיצה/נגיעה/Enter — מחליפה מצב: פותחת ומשאירה פתוח ("נעוץ") עד לחיצה נוספת, לחיצה
 *   מחוץ לו או Esc; כשהוא כבר פתוח (גם מריחוף או מפוקוס) — סוגרת.
 * Esc סוגר (גם כשהעכבר עדיין מעליו) — מאזין ברמת document כל עוד הרשימה פתוחה, כי ב-Safari
 * לחיצה לא ממקדת את הכפתור, ותפריט שננעץ בלחיצת עכבר לא היה מקבל את המקש. הפוקוס חוזר לכפתור
 * רק אם הוא היה בתוך הרכיב. יציאת הפוקוס מהרכיב סוגרת.
 * חיצים: למטה מהכפתור — אל הקישור הראשון; למעלה/למטה בין הקישורים.
 *
 * @param {{ label: string, items: Array<{ href: string, label: string, icon?: string, customIcon?: string, more?: boolean }>,
 *           className?: string }} props
 *   more — פריט "עוד..." שמופרד בקו מהשאר ומקבל חץ.
 */
export default function NavDropdown({ label, items, className = '' }) {
  const panelId = useId()
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  // Esc גובר על ריחוף/פוקוס עד שהעכבר יוצא או שהפוקוס עוזב
  const [dismissed, setDismissed] = useState(false)
  const open = !dismissed && (hovered || focused || pinned)

  // לחיצה מחוץ לרכיב סוגרת את המצב הנעוץ
  useEffect(() => {
    if (!pinned) return
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setPinned(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [pinned])

  // Esc — ברמת document כשהרשימה פתוחה (גם כשהפוקוס לא בתוך הרכיב). defaultPrevented — רכיב
  // אחר (דיאלוג, רמז) כבר טיפל במקש
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      const focusInside = rootRef.current?.contains(document.activeElement)
      setPinned(false)
      setFocused(false)
      setDismissed(true)
      if (focusInside) triggerRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const links = () => Array.from(rootRef.current?.querySelectorAll('[data-nav-dropdown-item]') ?? [])

  const onKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const list = links()
    if (list.length === 0) return
    const index = list.indexOf(document.activeElement)
    event.preventDefault()
    setDismissed(false)
    setFocused(true)
    if (index === -1) {
      if (event.key === 'ArrowDown') list[0].focus()
      return
    }
    const step = event.key === 'ArrowDown' ? 1 : -1
    list[(index + step + list.length) % list.length].focus()
  }

  return (
    <div
      ref={rootRef}
      className={`nav-dropdown relative ${className}`}
      data-open={open ? 'true' : 'false'}
      data-dismissed={dismissed ? 'true' : undefined}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true) }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return
        setHovered(false)
        setDismissed(false)
      }}
      onFocus={(event) => {
        // פוקוס מקלדת בלבד — בנגיעה הפוקוס מגיע יחד עם הלחיצה, והלחיצה היא שמחליטה
        if (event.target === triggerRef.current && event.target.matches(':focus-visible')) setFocused(true)
      }}
      onBlur={(event) => {
        if (rootRef.current?.contains(event.relatedTarget)) return
        setFocused(false)
        setPinned(false)
        setDismissed(false)
      }}
      onKeyDown={onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          // כפתור disclosure רגיל: פתוח (מכל סיבה) — נסגר; סגור — נפתח ונשאר פתוח
          setPinned(!open)
          setDismissed(open)
        }}
        className="nav-dropdown-trigger"
      >
        {label}
        <span className="material-symbols-outlined nav-dropdown-chevron" aria-hidden="true">expand_more</span>
      </button>

      <div id={panelId} className="nav-dropdown-panel">
        <ul className="nav-dropdown-list">
          {items.map(item => (
            <li key={item.href + item.label} className={item.more ? 'nav-dropdown-more' : undefined}>
              <Link
                href={item.href}
                prefetch={false}
                data-nav-dropdown-item=""
                className="nav-dropdown-item"
                onClick={() => { setPinned(false); setHovered(false); setFocused(false) }}
              >
                {(item.icon || item.customIcon) && (
                  <AppIcon name={item.icon} custom={item.customIcon} className="nav-dropdown-icon" />
                )}
                <span className="flex-1">{item.label}</span>
                {item.more && (
                  <span className="material-symbols-outlined nav-dropdown-arrow" aria-hidden="true">chevron_left</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
