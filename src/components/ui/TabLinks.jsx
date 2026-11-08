'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import AppIcon from './AppIcon'
import { cx } from './cx'
import TabCount from './TabCount'
import { tabClasses } from './tabStyles'

/**
 * לשוניות ניווט בין עמודים (קישורים, לא tabpanel): שורה עם קו תחתון דק, והלשונית הפעילה
 * מסומנת בטקסט primary ובפס primary בתחתיתה (לא בצבע בלבד) ו-aria-current="page".
 * בכל לשונית מטרת מגע מלאה (44px). כשאין מקום — השורה נגללת בתוך עצמה ולא מרחיבה את הדף.
 * בטלפון (מתחת ל-sm) — בלי האייקונים ועם ריפוד קטן יותר, כדי שארבע לשוניות ייכנסו בלי גלילה. אם בכל זאת
 * נגללת, הלשונית הפעילה נגללת לתוך השורה — לא לגעת בגלילה של הדף.
 *
 * @param {{ label: string, items: { id: string, href: string, label: string, shortLabel?: string, icon?: string, count?: number, countLabel?: string, countOnPhone?: boolean }[],
 *   activeId?: string | null, className?: string }} props
 * label — שם הניווט לקוראי מסך. activeId — הלשונית הפעילה (נקבעת אצל הקורא, לפי הכתובת).
 * count — מספר שקט אחרי השם ("אשפה 291"); בשם הנגיש — עם רווח ("אשפה 291", לא "אשפה291").
 * countLabel — מה המספר אומר, לקורא המסך ("8 חדשות" — השם הנגיש "נכנסות, 8 חדשות"); המספר עצמו אז מוסתר ממנו.
 * shortLabel — שם קצר לרוחב צר (כמו ב-ui/Tabs); השם הנגיש — תמיד המלא.
 * countOnPhone=false — המספר לא מוצג בטלפון (מידע, לא משימה), אבל נשאר בשם הנגיש.
 * disabled — הלשוניות נעולות (למשל בזמן פעולה מרובה): נראות אותו דבר אבל עמומות, ולחיצה עליהן לא עוברת.
 */
export default function TabLinks({ label, items, activeId, className, disabled = false }) {
  const navRef = useRef(null)

  useEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector('[aria-current="page"]')
    if (!active || nav.scrollWidth <= nav.clientWidth) return
    const box = nav.getBoundingClientRect()
    const tab = active.getBoundingClientRect()
    if (tab.left < box.left) nav.scrollLeft -= box.left - tab.left
    else if (tab.right > box.right) nav.scrollLeft += tab.right - box.right
  }, [activeId])

  return (
    <nav ref={navRef} aria-label={label} className={cx('scrollbar-thin overflow-x-auto border-b border-outline-variant', className)}>
      <ul className="flex min-w-max gap-1">
        {items.map((item) => {
          const active = item.id === activeId
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-disabled={disabled || undefined}
                tabIndex={disabled && !active ? -1 : undefined}
                onClick={disabled ? (e) => e.preventDefault() : undefined}
                className={cx(tabClasses(active), disabled && 'cursor-not-allowed opacity-(--button-disabled-opacity)')}
              >
                {item.icon && <AppIcon name={item.icon} className="shrink-0 text-icon-lg max-sm:hidden" />}
                {item.shortLabel ? (
                  <>
                    <span aria-hidden="true" className="whitespace-nowrap sm:hidden">{item.shortLabel}</span>
                    <span className="whitespace-nowrap max-sm:sr-only">{item.label}</span>
                  </>
                ) : <span className="whitespace-nowrap">{item.label}</span>}
                {typeof item.count === 'number' && <TabCount count={item.count} countLabel={item.countLabel} countOnPhone={item.countOnPhone !== false} />}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
