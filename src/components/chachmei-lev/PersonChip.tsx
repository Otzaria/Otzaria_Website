import NewWindowHint from '@/components/ui/NewWindowHint'
import { chipClasses } from '@/components/ui/Chip'
import { cx } from '@/components/ui/cx'
import { isLinkable } from '@/lib/chachmei-lev-data'

export type Person = { name: string; url?: string; description?: string }

/**
 * מידות וצורה משותפות לשני המצבים: ממלא את תא הרשת (w-full), הטקסט ממורכז, וריפוד צד מצומצם —
 * כדי ששלושה שבבים ייכנסו בשורה בנייד.
 * twoLine — כשלפחות לאחד ברשימה יש תיאור, כל השבבים ברשימה באותו גובה קבוע (שם + עד שתי
 * שורות תיאור מתחתיו), כדי שכולם יהיו באותו גודל בדיוק; שבב בלי תיאור פשוט מציג את השם ממורכז.
 */
function layout(twoLine: boolean) {
  return cx(
    'w-full flex-col justify-center gap-0.5 px-2 text-center',
    twoLine ? 'h-[4.25rem] py-1' : 'h-auto py-1.5'
  )
}

/**
 * אותה צורה בדיוק כמו שבב ui/Chip (מסגרת, רקע, גובה, פינות) — אבל בלי ריחוף, פוקוס ומטרת מגע,
 * כי אין מה ללחוץ. כך שם בלי קישור לא נראה "חסר" לצד שם עם קישור.
 */
const STATIC_CHIP =
  'inline-flex min-h-(--chip-height) max-w-full items-center rounded-(--chip-radius) border border-(--chip-border) bg-(--chip-bg) text-label-md text-(--chip-fg)'

/** התיאור — קטן ושקט מתחת לשם, עד שתי שורות (line-clamp); ארוך מזה נחתך ב-… והמלא ב-title. */
function Description({ text }: { text: string }) {
  return (
    <bdi title={text} className="line-clamp-2 w-full shrink-0 text-label-sm font-normal text-on-surface-variant">
      {text}
    </bdi>
  )
}

/**
 * אדם ברשימה (בתוכנה: _InfoChip), בלי אייקון — שבב אחיד לכולם, עם קישור ובלעדיו.
 * ההבדל עדין בלבד: שם עם קישור מגיב לריחוף (רקע, מסגרת וקו תחתון) ולפוקוס, ונפתח בחלון חדש.
 * bdi: שם לועזי ("shlomlaolam.", "o.t.p.") שומר על כיוונו — הנקודה נשארת בסוף השם.
 */
export default function PersonChip({ person, twoLine = false }: { person: Person; twoLine?: boolean }) {
  const name = (
    <bdi className="block w-full truncate underline-offset-4 group-hover:underline">{person.name}</bdi>
  )
  const description = person.description ? <Description text={person.description} /> : null

  if (isLinkable(person.url)) {
    return (
      <a
        href={person.url}
        target="_blank"
        rel="noopener noreferrer"
        className={chipClasses({ className: cx('group', layout(twoLine)) })}
      >
        {name}
        {description}
        <NewWindowHint />
      </a>
    )
  }
  return (
    <span className={cx(STATIC_CHIP, layout(twoLine))}>
      {name}
      {description}
    </span>
  )
}
