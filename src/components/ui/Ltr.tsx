import type { ReactNode } from 'react'
import { cx } from './cx'

/**
 * מונח לועזי בתוך שורה עברית (שם מערכת, גרסה, גודל קובץ, שם קובץ): <bdi dir="ltr"> שאינו
 * נשבר. בלי הבידוד "10 / 11", סוגריים ונקודה סביב המונח מתהפכים בפסקה RTL.
 * className — תוספת (למשל font-mono לשם קובץ או פקודה).
 */
export default function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return <bdi dir="ltr" className={cx('whitespace-nowrap', className)}>{children}</bdi>
}
