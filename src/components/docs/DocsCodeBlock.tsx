import type { ReactNode } from 'react'
import { PROSE, SCROLL_REGION } from './proseClasses'

/**
 * בלוק קוד במדריך הקבוע (פיתוח) — אותו מראה כמו בלוק קוד מהוויקי. LTR, גלילה פנימית,
 * ואזור גלילה נגיש במקלדת (tabIndex + שם).
 */
export default function DocsCodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <pre dir="ltr" tabIndex={0} role="region" aria-label="קוד" className={`${PROSE.pre} ${SCROLL_REGION}${className ? ` ${className}` : ''}`}>
      <code>{children}</code>
    </pre>
  )
}
