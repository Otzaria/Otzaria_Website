import type { CSSProperties, HTMLAttributes } from 'react'
import { cx } from './cx'

/**
 * קישוט הכותרת של אוצריא (מסכי המתקין): קו דק בצבע outline-variant ונקודת זהב במרכזו.
 * דקורטיבי בלבד (aria-hidden). המראה ב-.title-ornament (styles/effects.css).
 *
 * רוחב: יחסי לעטיפה שמעליו — שימו אותו בתוך עטיפה ברוחב הכותרת (w-fit) לצד הכותרת.
 *   ratio — חלק מרוחב העטיפה (ברירת מחדל 70%); min — רוחב מינימלי (120px);
 *   ringColor — צבע הטבעת סביב הנקודה, כשהקישוט על משטח שאינו רקע הדף (למשל דיאלוג על surface).
 * אפשר גם לקבוע אותם ב-className של variant (למשל [--ornament-ratio:100%]).
 */
export default function TitleOrnament({ ratio, min, ringColor, className, style, ...rest }: {
  ratio?: string
  min?: string
  ringColor?: string
  className?: string
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>) {
  const vars = {
    ...(ratio ? { '--ornament-ratio': ratio } : null),
    ...(min ? { '--ornament-min': min } : null),
    ...(ringColor ? { '--ornament-bg': ringColor } : null),
    ...style
  } as CSSProperties
  return (
    <span
      {...rest}
      aria-hidden="true"
      className={cx('title-ornament', className)}
      style={Object.keys(vars).length ? vars : undefined}
    />
  )
}
