'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import AppIcon from './AppIcon'
import Kbd from './Kbd'
import { cx } from './cx'
import { FOCUS_RING_INSET } from './focusRing'

/**
 * הודעות קופצות (toast) — משוב על פעולה שהסתיימה, במקום alert / showAlert: "\"חוות דעת\" הועבר
 * לאשפה · בטל". למטה במרכז, על משטח הפוך (כהה), כדי שלא ייבלעו ברשימה, ומעל דיאלוגים (--z-toast).
 * חוץ מגיליון הבחירה של ui/SelectMenu בטלפון (data-select-sheet): הוא תופס את תחתית המסך, וההודעה הייתה מכסה
 * את האפשרויות ונראית כחלק ממנו — בזמן שהוא פתוח ההודעות מוסתרות, וחוזרות כשהוא נסגר (הטיימר שלהן ממשיך).
 *
 * שימוש: <ToastProvider> פעם אחת — במעטפת הניהול (AdminShell), כך שהודעה שורדת מעבר בין לשוניות
 * ומסכים; provider מקונן לא יוצר ערימה שנייה. בתוכו useToast():
 *   const toast = useToast()
 *   const id = toast.show({ message: '...', action: { label: 'בטל', onClick: undo, undo: true } })
 *   toast.show({ id, message: '3 ספרים הועברו לאשפה', action })   // עדכון במקום (צבירה)
 *   toast.show({ message: 'לא הצלחנו למחוק', tone: 'error' })
 *
 * כמה זמן:
 *   הצלחה / מידע בלי פעולה — 5 שניות (עוצר בריחוף ובפוקוס).
 *   עם פעולה ("בטל") — בלי טיימר: נשארת עד שסוגרים, עד שלוחצים, או עד שהמסך מעדכן אותה. כך גם
 *     מי שעובד במקלדת או לאט מספיק לבטל (WCAG 2.2.1).
 *   שגיאה — role="alert", נשארת עד שסוגרים.
 * id — הצגה עם id של הודעה פתוחה מעדכנת אותה במקום (צבירה: "3 ספרים הועברו לאשפה"), בלי הודעה
 * נוספת. onDismiss — נקרא כשההודעה יורדת מהמסך (סגירה, לחיצה על הפעולה, דחיקה) — כדי שהמסך יידע
 * שהצבירה נגמרה.
 *
 * מקלדת: Ctrl+Z (⌘Z) מפעיל את "בטל" של ההודעה האחרונה שיש לה action.undo — מכל מקום בדף (גם
 * מתיבת הסימון של השורה הבאה, שאליה עובר הפוקוס אחרי מחיקה), חוץ משדה הקלדה (שם Ctrl+Z מבטל הקלדה). Esc בתוך ההודעה סוגר אותה. action.href — קישור ("התחבר").
 * לכל היותר 3 בבת אחת: כשנוספת רביעית, יורדת הוותיקה שאין בה פעולה ואינה שגיאה (ורק אם אין כזו —
 * הוותיקה שאינה שגיאה, ורק אם כולן שגיאות — השגיאה הוותיקה).
 * הודעה זהה (אותו טקסט ואותו טון, בלי id) לא נערמת: ההודעה הפתוחה מתחדשת במקום (הטיימר מתחיל מחדש).
 * Esc — גם כשהפוקוס לא בהודעה — סוגר את ההודעה האחרונה, כשאין חלון / תפריט פתוח ולא בשדה הקלדה.
 *
 * נגישות: שני אזורי live קבועים (status / alert) שקיימים ב-DOM עוד לפני ההודעה הראשונה — אחרת
 * קורא המסך לא מכריז. forced-colors: מסגרת, כי הצל והמשטח נעלמים.
 */
const ToastContext = createContext(null)

const MAX_TOASTS = 3
const DEFAULT_MS = 5000
export const UNDO_SHORTCUT = 'Control+Z Meta+Z'

const TONE_ICON = { success: 'check_circle', info: 'info', error: 'error' }
const TONE_ICON_CLASS = { success: 'text-inverse-primary', info: 'text-inverse-on-surface', error: 'text-error-container' }

let nextId = 1

const noop = () => () => {}
const useMounted = () => useSyncExternalStore(noop, () => true, () => false)

export function ToastProvider({ children }) {
  // כבר בתוך provider (מסך שעוטף את עצמו בתוך המעטפת) — אותה ערימה, בלי שנייה
  const parent = useContext(ToastContext)
  if (parent) return children
  return <ToastHost>{children}</ToastHost>
}

/** הוצאת הודעה עודפת: קודם בלי פעולה ולא שגיאה, אחר כך כל מה שאינו שגיאה */
function trim(list) {
  const out = [...list]
  while (out.length > MAX_TOASTS) {
    let index = out.findIndex((t) => t.tone !== 'error' && !t.action)
    if (index < 0) index = out.findIndex((t) => t.tone !== 'error')
    if (index < 0) index = 0
    out.splice(index, 1)
  }
  return out
}

// שדה שמקלידים בו — שם Ctrl+Z מבטל הקלדה ושייך לשדה (תיבת סימון / כפתור — לא)
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', ''])
function isTextEntry(target) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true
  return target.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((target.getAttribute('type') || '').toLowerCase())
}

function ToastHost({ children }) {
  const [toasts, setToasts] = useState([])
  const toastsRef = useRef(toasts)
  // onDismiss של הודעות שירדו — אחרי שה-state התעדכן (לא בתוך ה-updater, שעשוי לרוץ פעמיים)
  useEffect(() => {
    const prev = toastsRef.current
    toastsRef.current = toasts
    for (const t of prev) if (!toasts.some((n) => n.id === t.id)) t.onDismiss?.()
  }, [toasts])

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(({ id, message, tone = 'success', action, duration, onDismiss } = {}) => {
    // אותה הודעה שכבר פתוחה (שגיאה שחוזרת, "חסום" כפול) — מתחדשת במקום, לא נערמת
    const same = (t) => id == null && typeof message === 'string' && t.message === message && t.tone === tone && !t.action?.undo
    const toastId = id ?? toastsRef.current.find(same)?.id ?? nextId++
    const ms = duration !== undefined ? duration : tone === 'error' || action ? null : DEFAULT_MS
    const next = { id: toastId, message, tone, action, duration: ms, onDismiss, version: 0 }
    setToasts((list) => {
      let index = list.findIndex((t) => t.id === toastId)
      if (index < 0) index = list.findIndex(same)
      if (index >= 0) next.id = list[index].id
      if (index < 0) return trim([...list, next])
      const copy = [...list]
      copy[index] = { ...next, version: list[index].version + 1 }
      return copy
    })
    return toastId
  }, [])

  // Ctrl+Z / ⌘Z — "בטל" של ההודעה האחרונה שאפשר לבטל, כשהפוקוס לא בשדה טקסט
  useEffect(() => {
    const onKey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.code !== 'KeyZ') return
      if (isTextEntry(event.target)) return
      const latest = [...toastsRef.current].reverse().find((t) => t.action?.undo && t.action.onClick)
      if (!latest) return
      event.preventDefault()
      dismiss(latest.id)
      latest.action.onClick()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dismiss])

  // Esc — סוגר את ההודעה האחרונה, כשה-Esc לא שייך לדבר אחר (חלון, תפריט, רשימה נפתחת, שדה הקלדה)
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isTextEntry(event.target)) return
      const latest = toastsRef.current.at(-1)
      if (!latest) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"], [role="listbox"]')) return
      dismiss(latest.id)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dismiss])

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])
  const mounted = useMounted()
  const polite = toasts.filter((t) => t.tone !== 'error')
  const urgent = toasts.filter((t) => t.tone === 'error')

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted && createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-(--z-toast) flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] [body:has([data-select-sheet])_&]:invisible">
          <div role="status" aria-live="polite" aria-relevant="additions text" className="flex w-full flex-col items-center gap-2">
            {polite.map((t) => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
          </div>
          <div role="alert" aria-live="assertive" className="flex w-full flex-col items-center gap-2">
            {urgent.map((t) => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
          </div>
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

/** @returns {{ show: (options: { id?: number, message: import('react').ReactNode, tone?: 'success'|'info'|'error', action?: { label: string, onClick?: () => void, href?: string, undo?: boolean }, duration?: number | null, onDismiss?: () => void }) => number, dismiss: (id: number) => void }} */
export function useToast() {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}

function ToastItem({ toast, onDismiss }) {
  const { id, message, tone, action, duration, version } = toast
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovered || focused

  // הטיימר מתחיל מחדש בכל עדכון של ההודעה (version) ובכל יציאה מריחוף / פוקוס
  useEffect(() => {
    if (duration == null || paused) return undefined
    const timer = setTimeout(() => onDismiss(id), duration)
    return () => clearTimeout(timer)
  }, [duration, paused, id, onDismiss, version])

  const actionClass = cx('inline-flex min-h-(--touch-target) shrink-0 items-center gap-2 rounded-(--radius-control) px-3 text-label-lg text-inverse-primary hover:bg-inverse-on-surface/10', FOCUS_RING_INSET)

  return (
    <div
      data-toast={tone}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onDismiss(id)
        }
      }}
      className={cx(
        'pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-(--radius-control) bg-inverse-surface py-1 ps-4 pe-1 text-inverse-on-surface shadow-raised',
        'animate-[enter-up_var(--motion-duration-standard)_var(--ease-enter)_backwards] motion-reduce:animate-none',
        'forced-colors:border forced-colors:border-[CanvasText]'
      )}
    >
      <AppIcon name={TONE_ICON[tone] || TONE_ICON.info} className={cx('shrink-0 text-icon-lg', TONE_ICON_CLASS[tone])} />
      <p className="min-w-0 flex-1 py-2 text-body-md">{message}</p>
      {action && (action.href ? (
        <a href={action.href} className={actionClass}>{action.label}</a>
      ) : (
        <button
          type="button"
          aria-keyshortcuts={action.undo ? UNDO_SHORTCUT : undefined}
          onClick={() => {
            onDismiss(id)
            action.onClick?.()
          }}
          className={actionClass}
        >
          {action.label}
          {action.undo && <Kbd keys={['Ctrl', 'Z']} decorative className="hidden opacity-80 pointer-fine:inline-flex" />}
        </button>
      ))}
      <button
        type="button"
        aria-label="סגור הודעה"
        onClick={() => onDismiss(id)}
        className={cx('flex size-(--touch-target) shrink-0 items-center justify-center rounded-(--radius-control) text-inverse-on-surface/80 hover:bg-inverse-on-surface/10', FOCUS_RING_INSET)}
      >
        <AppIcon name="close" className="text-icon-lg" />
      </button>
    </div>
  )
}
