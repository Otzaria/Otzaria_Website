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

/**
 * כרטיס-רמז מתחת לרכיב (ריחוף בעכבר / פוקוס מקלדת). המראה ב-styles/tooltip.css.
 *
 * children — רכיב יחיד ואינטראקטיבי (קישור/כפתור). מקבל aria-describedby שמצביע על הרמז,
 *            כך שקורא מסך שומע אותו תמיד — גם בלי ריחוף.
 * content  — תוכן הרמז: משפט קצר, או מבנה עשיר (אייקון + שתי שורות, כמו ברמז התרומה).
 *
 * התנהגות (WCAG 1.4.13): נשאר כשהעכבר עובר אליו (גשר שקוף); Esc מסתיר אותו עד שהעכבר או
 * הפוקוס עוזבים; לא חוסם לחיצות כשהוא מוסתר. ממורכז מתחת לרכיב, וכשהוא חורג מקצה המסך הוא
 * מוזז פנימה (--tooltip-shift; החוד נשאר מול הרכיב).
 * במגע אין ריחוף — מידע חיוני לא יכול לחיות רק ברמז (ראו DonationNote בתפריט הנייד).
 */
export default function Tooltip({ content, children, className, bubbleClassName }: {
  content: ReactNode
  children: ReactElement<{ 'aria-describedby'?: string }>
  className?: string
  bubbleClassName?: string
}) {
  const tipId = useId()
  const hostRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const [dismissed, setDismissed] = useState(false)
  const reset = () => setDismissed(false)

  const place = useCallback(() => {
    const host = hostRef.current
    const bubble = bubbleRef.current
    if (!host || !bubble) return
    const rect = host.getBoundingClientRect()
    const shift = clampShift({
      centerX: rect.left + rect.width / 2,
      width: bubble.offsetWidth,
      viewportWidth: document.documentElement.clientWidth
    })
    host.style.setProperty('--tooltip-shift', `${shift}px`)
  }, [])

  useEffect(() => {
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [place])

  const trigger = isValidElement(children)
    ? cloneElement(children, {
      'aria-describedby': cx(children.props['aria-describedby'], tipId) || undefined
    })
    : children

  return (
    <span
      ref={hostRef}
      className={cx('tooltip-host', className)}
      data-tip-dismissed={dismissed ? 'true' : undefined}
      onPointerEnter={place}
      onFocus={place}
      onPointerLeave={reset}
      onBlur={reset}
      onKeyDown={(event) => { if (event.key === 'Escape') setDismissed(true) }}
    >
      {trigger}
      <span className="tooltip" role="tooltip" id={tipId}>
        <span ref={bubbleRef} className={cx('tooltip-bubble', bubbleClassName)}>{content}</span>
      </span>
    </span>
  )
}
