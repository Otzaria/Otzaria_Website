'use client'

import { useId } from 'react'
import { cardClasses } from './Card'
import { cx } from './cx'

/**
 * אזור בתוך מסך: כרטיס (בלי צל ומסגרת), כותרת h2 (שם האזור), שורת הסבר ופעולות בקצה.
 * headingRef — לכותרת (tabIndex=-1): לשם מחזירים את הפוקוס כשהכפתור שנלחץ נעלם.
 * @param {{ title?: import('react').ReactNode, description?: import('react').ReactNode, actions?: import('react').ReactNode,
 *   children: import('react').ReactNode, testId?: string, className?: string, headingRef?: import('react').Ref<HTMLHeadingElement> }} props
 */
export default function CardSection({ title, description, actions, children, testId, className, headingRef }) {
  const id = useId()
  return (
    <section aria-labelledby={title ? id : undefined} data-testid={testId} className={cardClasses({ padding: 'md', className: cx('flex min-w-0 flex-col gap-4', className) })}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {title && <h2 id={id} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="min-w-0 flex-1 text-title-md text-on-surface outline-none">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {description && <div className="-mt-2 text-body-sm text-on-surface-variant">{description}</div>}
      {children}
    </section>
  )
}
