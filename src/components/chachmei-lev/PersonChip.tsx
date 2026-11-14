import NewWindowHint from '@/components/ui/NewWindowHint'
import { chipClasses } from '@/components/ui/Chip'
import { cx } from '@/components/ui/cx'
import { isLinkable } from '@/lib/chachmei-lev-data'

export type Person = { name: string; url?: string; description?: string }

/**
 * מידות וצורה משותפות לשני המצבים: ממלא את תא הרשת (w-full), הטקסט ממורכז, וריפוד צד מצומצם —
 * כדי ששלושה שבבים ייכנסו בשורה בנייד. שם ארוך נשבר לשתי שורות במקום לחרוג מהתא.
 */
const LAYOUT = 'h-auto w-full justify-center px-2 py-1.5 text-center'

/**
 * אותה צורה בדיוק כמו שבב ui/Chip (מסגרת, רקע, גובה, פינות) — אבל בלי ריחוף, פוקוס ומטרת מגע,
 * כי אין מה ללחוץ. כך שם בלי קישור לא נראה "חסר" לצד שם עם קישור.
 */
const STATIC_CHIP =
  'inline-flex min-h-(--chip-height) max-w-full items-center rounded-(--chip-radius) border border-(--chip-border) bg-(--chip-bg) text-label-md text-(--chip-fg)'

/**
 * אדם ברשימה (בתוכנה: _InfoChip), בלי אייקון — שבב אחיד לכולם, עם קישור ובלעדיו.
 * ההבדל עדין בלבד: שם עם קישור מגיב לריחוף (רקע, מסגרת וקו תחתון) ולפוקוס, ונפתח בחלון חדש.
 * התיאור (person.description) אינו בתוך השבב — הוא מוצג כהערה מתחת לרשימה (PeopleList), כדי
 * שכל השבבים יישארו באותו רוחב.
 * bdi: שם לועזי ("shlomlaolam.", "o.t.p.") שומר על כיוונו — הנקודה נשארת בסוף השם.
 */
export default function PersonChip({ person }: { person: Person }) {
  if (isLinkable(person.url)) {
    return (
      <a
        href={person.url}
        target="_blank"
        rel="noopener noreferrer"
        className={chipClasses({ className: cx('group', LAYOUT) })}
      >
        <bdi className="min-w-0 underline-offset-4 group-hover:underline">{person.name}</bdi>
        <NewWindowHint />
      </a>
    )
  }
  return (
    <span className={cx(STATIC_CHIP, LAYOUT)}>
      <bdi className="min-w-0">{person.name}</bdi>
    </span>
  )
}
