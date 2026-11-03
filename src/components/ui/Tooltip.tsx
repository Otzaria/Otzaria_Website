'use client'

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { clampShift } from '@/lib/donationTip'
import { cx } from './cx'
import { shouldSkipDelay, tooltipSide } from './tooltipPlacement'

/** מתי נסגר לאחרונה רמז שהיה גלוי — לדילוג על ההשהיה במעבר בין כפתורים שכנים */
let lastShownHiddenAt = 0

/**
 * כרטיס-רמז ליד רכיב (ריחוף בעכבר / פוקוס מקלדת). המראה ב-styles/tooltip.css.
 *
 * children — רכיב יחיד ואינטראקטיבי (קישור/כפתור). מקבל aria-describedby שמצביע על הרמז,
 *            כך שקורא מסך שומע אותו תמיד — גם בלי ריחוף.
 * content  — תוכן הרמז: משפט קצר, או מבנה עשיר (אייקון + שתי שורות, כמו ברמז התרומה).
 * compact  — רמז קטן (שורות הכלים של העורך): ריפוד 4×8 וטקסט label-md.
 * suppressed — מוסתר בכוח (למשל כשהתפריט של הכפתור פתוח); אחרי שחרורו נשאר מוסתר עד
 *              שהעכבר או הפוקוס עוזבים — כדי שהחזרת הפוקוס לכפתור (Esc בתפריט) לא תקפיץ אותו.
 *
 * מיקום: position: fixed (z-index --z-tooltip), כך שמכל עם overflow (פאנל, שורת כלים) לא חותך
 * אותו וסרגל דביק לא מסתיר אותו. place() מחשב אותו בריחוף/פוקוס: מתחת לרכיב, או מעליו כשאין
 * מקום מתחת (data-tip-side="top"); מוזז פנימה כשהוא חורג מקצה המסך (--tooltip-shift; החוד נשאר
 * מול הרכיב). אם לאב יש transform/filter (שהופך אותו ל-containing block של fixed) — המיקום
 * מתוקן לפי מדידה.
 *
 * התנהגות (WCAG 1.4.13): נשאר כשהעכבר עובר אליו (גשר שקוף); Esc מסתיר אותו עד שהעכבר או
 * הפוקוס עוזבים; לא חוסם לחיצות כשהוא מוסתר. השהיה בריחוף (--tooltip-delay), אבל מעבר לרכיב
 * שכן תוך זמן קצר מציג את הרמז מיד (data-tip-instant).
 * במגע אין ריחוף — מידע חיוני לא יכול לחיות רק ברמז (ראו DonationNote בתפריט הנייד).
 */
export default function Tooltip({ content, children, className, bubbleClassName, compact = false, suppressed = false }: {
  content: ReactNode
  children: ReactElement<{ 'aria-describedby'?: string }>
  className?: string
  bubbleClassName?: string
  compact?: boolean
  suppressed?: boolean
}) {
  const tipId = useId()
  const hostRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const hoveredRef = useRef(false)
  const activeRef = useRef(false)
  const [dismissed, setDismissed] = useState(false)
  const reset = () => setDismissed(false)
  const dismissOnEscape = useCallback((event: { key: string; defaultPrevented: boolean; preventDefault(): void }) => {
    if (dismissed || event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    setDismissed(true)
  }, [dismissed])

  // שחרור ההסתרה הכפויה (התפריט נסגר) — הרמז נשאר מוסתר עד יציאת העכבר/הפוקוס
  const wasSuppressed = useRef(suppressed)
  useEffect(() => {
    if (wasSuppressed.current && !suppressed) setDismissed(true)
    wasSuppressed.current = suppressed
  }, [suppressed])

  const place = useCallback(() => {
    const host = hostRef.current
    const tip = tipRef.current
    const bubble = bubbleRef.current
    if (!host || !tip || !bubble) return
    const rect = host.getBoundingClientRect()
    const gap = tip.offsetHeight
    const side = tooltipSide({
      anchorTop: rect.top,
      anchorBottom: rect.bottom,
      height: bubble.offsetHeight,
      gap,
      viewportHeight: document.documentElement.clientHeight || window.innerHeight
    })
    const x = rect.left
    const y = side === 'top' ? rect.top - gap : rect.bottom
    host.dataset.tipSide = side
    host.style.setProperty('--tooltip-x', `${x}px`)
    host.style.setProperty('--tooltip-y', `${y}px`)
    host.style.setProperty('--tooltip-w', `${rect.width}px`)
    // תיקון containing block: אב עם transform/filter מזיז את ה-fixed — מודדים בלי ההחלקה
    const { translate, transition } = tip.style
    tip.style.transition = 'none'
    tip.style.translate = 'none'
    const actual = tip.getBoundingClientRect()
    tip.style.translate = translate
    tip.style.transition = transition
    const dx = x - actual.left
    const dy = y - actual.top
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      host.style.setProperty('--tooltip-x', `${x + dx}px`)
      host.style.setProperty('--tooltip-y', `${y + dy}px`)
    }
    const shift = clampShift({
      centerX: rect.left + rect.width / 2,
      width: bubble.offsetWidth,
      viewportWidth: document.documentElement.clientWidth
    })
    host.style.setProperty('--tooltip-shift', `${shift}px`)
  }, [])

  // המיקום מחושב רק בריחוף/פוקוס, לא בכל resize — הרמז נראה רק אז. בזמן שהוא פעיל, גלילה
  // (של העמוד או של מכל פנימי) מזיזה את הרכיב, ולכן הרמז הקבוע (fixed) מחושב מחדש.
  const activate = useCallback(() => {
    place()
    if (activeRef.current) return
    activeRef.current = true
    window.addEventListener('scroll', place, true)
  }, [place])
  const deactivate = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    window.removeEventListener('scroll', place, true)
  }, [place])
  useEffect(() => deactivate, [deactivate])

  // בריחוף הפוקוס עשוי להיות במקום אחר, ולכן Esc חייב להיקלט גם מחוץ לרכיב.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (hoveredRef.current) dismissOnEscape(event)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [dismissOnEscape])

  const trigger = isValidElement(children)
    ? cloneElement(children, {
      'aria-describedby': cx(children.props['aria-describedby'], tipId) || undefined
    })
    : children

  const tipVisible = () => {
    const tip = tipRef.current
    return !!tip && getComputedStyle(tip).visibility === 'visible'
  }

  return (
    <span
      ref={hostRef}
      className={cx('tooltip-host', compact && 'tooltip-compact', className)}
      data-tip-dismissed={dismissed || suppressed ? 'true' : undefined}
      onPointerEnter={(event) => {
        hoveredRef.current = event.pointerType === 'mouse'
        if (shouldSkipDelay(Date.now(), lastShownHiddenAt)) event.currentTarget.dataset.tipInstant = ''
        else delete event.currentTarget.dataset.tipInstant
        activate()
      }}
      onFocus={activate}
      onPointerLeave={(event) => {
        hoveredRef.current = false
        if (tipVisible()) lastShownHiddenAt = Date.now()
        // Esc ואחריו יציאת עכבר, כשהפוקוס עדיין על הכפתור — הרמז נשאר מוסתר עד שהפוקוס עוזב
        if (event.currentTarget.contains(document.activeElement)) return
        deactivate()
        reset()
      }}
      onBlur={() => {
        if (!hoveredRef.current) deactivate()
        reset()
      }}
      onKeyDown={dismissOnEscape}
    >
      {trigger}
      <span ref={tipRef} className="tooltip" role="tooltip" id={tipId}>
        <span ref={bubbleRef} className={cx('tooltip-bubble', bubbleClassName)}>{content}</span>
      </span>
    </span>
  )
}
