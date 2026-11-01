'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppIcon from './AppIcon'
import Button from './Button'
import { cx } from './cx'
import { usePortalContainer } from './portalContainer'
import { clampPanelPosition, panelMaxHeight, panelWidth, parseSavedPosition } from './floatingPanelGeometry'

const FOCUSABLE = 'input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * חלון צף שאינו מודאלי (חיפוש והחלפה, בדיקת איות): העורך מאחוריו נשאר פעיל, והחלון נגרר
 * בכותרת. נגישות: role="dialog" (בלי aria-modal) + aria-labelledby, הפוקוס נכנס לחלון בפתיחה
 * (ילד עם autoFocus — נשמר), Esc כשהפוקוס בחלון סוגר, והפוקוס חוזר למי שפתח (רק אם הוא עדיין בחלון).
 * returnFocus — יעד חלופי לחזרת הפוקוס כשמי שפתח כבר לא במסמך (פריט בתפריט שנסגר, חלון הפקודות):
 * בלעדיו הפוקוס היה נופל לגוף הדף. למשל שדה העריכה הפעיל — הוא שומר את מקום הסמן.
 *
 * הרוחב min(width, 100vw-32px), הגובה עד 85dvh, והמיקום נצמד לחלון הדפדפן (גם אחרי שינוי גודל) —
 * floatingPanelGeometry.js. storageKey — המיקום נשמר ב-localStorage בין עמודים.
 * escapeWithin — סלקטור של אזור נוסף (למשל העורך) שבו Esc סוגר את החלון גם כשהפוקוס שם ולא
 * בחלון (אחרי "חפש הבא" הפוקוס עובר לעורך) — אלא אם מישהו אחר כבר טיפל ב-Esc (defaultPrevented).
 *
 * @param {{ title: import('react').ReactNode, icon?: string, onClose: () => void, storageKey?: string,
 *   width?: number, defaultPosition: (vp: { width: number, height: number }) => { x: number, y: number },
 *   headerActions?: import('react').ReactNode, children: import('react').ReactNode, bodyClassName?: string,
 *   escapeWithin?: string, returnFocus?: () => HTMLElement | null }} props
 */
export default function FloatingPanel(props) {
  const container = usePortalContainer()
  if (!container) return null
  return createPortal(<Panel {...props} />, container)
}

function Panel({ title, icon, onClose, storageKey, width = 400, defaultPosition, headerActions, children, bodyClassName, escapeWithin, returnFocus }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const dragRef = useRef(null)
  const [vp, setVp] = useState(viewport)
  const [pos, setPos] = useState(() => {
    let saved = null
    try { saved = storageKey ? parseSavedPosition(window.localStorage.getItem(storageKey)) : null } catch { saved = null }
    return saved || defaultPosition(viewport())
  })
  const w = panelWidth(width, vp.width)
  const shown = clampPanelPosition(pos, w, vp)

  // שינוי גודל החלון — המיקום המוצג נצמד מחדש (המיקום השמור לא משתנה)
  useEffect(() => {
    const onResize = () => setVp(viewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // מי שפתח: הפוקוס בזמן הרינדור הראשון — לפני ה-commit, שבו ילד עם autoFocus כבר לוקח אותו
  const [openerAtRender] = useState(() => (typeof document === 'undefined' ? null : document.activeElement))
  const returnFocusRef = useRef(returnFocus)
  useLayoutEffect(() => { returnFocusRef.current = returnFocus })

  // פוקוס פנימה בפתיחה, וחזרה לפותח בסגירה (אם הפוקוס עוד בחלון — לא גונבים אותו מהעורך).
  // הפותח כבר לא במסמך (או שלא היה) — ליעד החלופי returnFocus
  useLayoutEffect(() => {
    const panel = panelRef.current
    const opener = openerAtRender instanceof HTMLElement && openerAtRender !== document.body && !panel?.contains(openerAtRender)
      ? openerAtRender
      : null
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector('[data-autofocus]') || panel.querySelector(`[data-panel-body] :is(${FOCUSABLE})`)
      ;(first || panel).focus({ preventScroll: true })
    }
    return () => {
      if (!panel || !panel.contains(document.activeElement)) return
      const target = opener?.isConnected ? opener : returnFocusRef.current?.()
      if (target?.isConnected && !panel.contains(target)) target.focus({ preventScroll: true })
    }
  },[openerAtRender])

  // Esc באזור הנוסף (העורך) — מאזין bubble על המסמך: רץ אחרי המאזינים של העורך עצמו
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    if (!escapeWithin) return undefined
    const onDocKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const t = event.target
      if (!(t instanceof Element) || panelRef.current?.contains(t) || !t.closest(escapeWithin)) return
      event.preventDefault()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onDocKeyDown)
    return () => document.removeEventListener('keydown', onDocKeyDown)
  }, [escapeWithin])

  const onKeyDown = (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }

  const savePos = useCallback((next) => {
    if (!storageKey) return
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* מצב פרטי / מכסה */ }
  }, [storageKey])

  const onPointerDown = (event) => {
    if (event.button !== 0 || event.target.closest('button,a,input,select')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { dx: event.clientX - shown.x, dy: event.clientY - shown.y }
  }
  const onPointerMove = (event) => {
    if (!dragRef.current) return
    setPos(clampPanelPosition({ x: event.clientX - dragRef.current.dx, y: event.clientY - dragRef.current.dy }, w, viewport()))
  }
  const onPointerUp = () => {
    if (!dragRef.current) return
    dragRef.current = null
    savePos(shown)
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      dir="rtl"
      onKeyDown={onKeyDown}
      style={{ left: shown.x, top: shown.y, width: w, maxHeight: panelMaxHeight(shown.y, vp.height) }}
      className={cx(
        'fixed z-(--z-overlay) flex flex-col overflow-hidden rounded-(--dialog-radius) border border-outline-variant',
        'bg-(--dialog-bg) text-on-surface shadow-(--dialog-shadow) outline-none',
        'animate-[enter-up_var(--motion-duration-standard)_var(--ease-enter)_backwards] motion-reduce:animate-none'
      )}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex shrink-0 cursor-move touch-none select-none items-center gap-2 border-b border-outline-variant py-1 ps-4 pe-1"
      >
        {icon && <AppIcon name={icon} className="text-xl text-primary" />}
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-title-md text-on-surface">{title}</h2>
        {headerActions}
        <Button variant="text" size="sm" iconOnly icon="close" aria-label="סגירה" onClick={onClose} />
      </div>
      <div data-panel-body="" className={cx('custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain', bodyClassName ?? 'p-4')}>
        {children}
      </div>
    </div>
  )
}
