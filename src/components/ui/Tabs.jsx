'use client'

import { useEffect, useRef } from 'react'
import AppIcon from './AppIcon'
import { cx } from './cx'
import TabCount from './TabCount'
import { tabClasses } from './tabStyles'

/**
 * לשוניות בתוך אזור (tablist + tabpanel), בלי ניווט בין עמודים — לזה יש ui/TabLinks. אותו מראה:
 * קו תחתון דק, והלשונית הפעילה בטקסט primary ובפס primary בתחתיתה (לא בצבע בלבד), מטרת מגע 44px.
 *
 * מקלדת (WAI-ARIA, הפעלה אוטומטית): חיצים בין הלשוניות לפי כיוון הקריאה (ב-RTL — שמאלה היא הבאה),
 * Home / End. רק הלשונית הפעילה ב-Tab order; ממנה Tab ממשיך לתוכן. הפוקוס עובר ללשונית החדשה רק אחרי
 * שהיא באמת נבחרה (value השתנה) — כשהקורא עוצר את המעבר (למשל "לצאת בלי לשמור?"), הפוקוס לא בורח
 * מחלון האישור אל הלשונית שמאחוריו.
 * כשאין מקום — השורה נגללת בתוך עצמה ולא מרחיבה את הדף.
 *
 * הלוח עצמו — אצל הקורא, עם tabPanelProps(idPrefix, id) (role, id, aria-labelledby).
 *
 * shortLabel — שם קצר לרוחב צר (מתחת ל-sm), כדי שכל הלשוניות ייכנסו בטלפון; השם הנגיש — תמיד המלא.
 * count — מונה ליד השם (כמו ב-TabLinks); countLabel — הנוסח לקורא המסך ("12 ממתינים לאישור").
 * count=null — המונה עוד נטען: מקום שמור (שקוף), כדי שהלשוניות לא יזוזו כשהמספרים מגיעים.
 *
 * @param {{ label: string, idPrefix: string, items: { id: string, label: string, shortLabel?: string, icon?: string, count?: number, countLabel?: string }[],
 *   value: string, onChange: (id: string) => void, className?: string }} props
 */
export default function Tabs({ label, idPrefix, items, value, onChange, className }) {
  const listRef = useRef(null)
  const pendingFocus = useRef(null)

  useEffect(() => {
    if (pendingFocus.current !== value) return
    pendingFocus.current = null
    listRef.current?.querySelector(`[data-tab="${CSS.escape(value)}"]`)?.focus()
  }, [value])

  const focusTab = (id) => {
    pendingFocus.current = id
    onChange(id)
  }

  const onKeyDown = (event) => {
    const index = items.findIndex((i) => i.id === value)
    if (index < 0) return
    const rtl = getComputedStyle(event.currentTarget).direction !== 'ltr'
    const step = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 }[event.key]
    let next = null
    if (step) next = items[(index + step + items.length) % items.length]
    else if (event.key === 'Home') next = items[0]
    else if (event.key === 'End') next = items[items.length - 1]
    if (!next) return
    event.preventDefault()
    focusTab(next.id)
  }

  return (
    <div className={cx('scrollbar-thin overflow-x-auto', className)}>
      <div ref={listRef} role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex min-w-max sm:gap-1">
        {items.map((item) => {
          const active = item.id === value
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${item.id}`}
              data-tab={item.id}
              aria-selected={active}
              aria-controls={`${idPrefix}-panel-${item.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={cx(tabClasses(active), item.hideOnPhone && !active && 'max-sm:hidden')}
            >
              {item.icon && <AppIcon name={item.icon} className="shrink-0 text-icon-lg max-sm:hidden" />}
              {item.shortLabel ? (
                <>
                  <span aria-hidden="true" className="sm:hidden">{item.shortLabel}</span>
                  <span className="max-sm:sr-only">{item.label}</span>
                </>
              ) : item.label}
              {item.count === null && <span aria-hidden="true" className="invisible px-2 text-label-sm tabular-nums">00</span>}
              {typeof item.count === 'number' && <TabCount count={item.count} countLabel={item.countLabel} countOnPhone={item.countOnPhone !== false} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** המאפיינים של לוח הלשונית — כדי שהקשר בינו לבין הלשונית יהיה תמיד נכון */
export function tabPanelProps(idPrefix, id) {
  return { role: 'tabpanel', id: `${idPrefix}-panel-${id}`, 'aria-labelledby': `${idPrefix}-tab-${id}`, tabIndex: 0 }
}
