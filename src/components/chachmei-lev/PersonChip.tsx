import NewWindowHint from '@/components/ui/NewWindowHint'
import { chipClasses } from '@/components/ui/Chip'
import { cx } from '@/components/ui/cx'
import { isLinkable } from '@/lib/chachmei-lev-data'

export type Person = { name: string; url?: string; description?: string }

/**
 * שם שאינו קישור — שטוח: בלי מסגרת, בלי רקע ובלי ריחוף, כדי שלא ייראה לחיץ. אותו גובה וגופן
 * כמו השבב, כך ששורה מעורבת נשארת ישרה.
 */
const STATIC_NAME =
  'inline-flex min-h-(--chip-height) max-w-full items-center gap-1.5 px-2 text-label-md text-on-surface-variant'

function Content({ person, linked }: { person: Person; linked: boolean }) {
  return (
    <>
      {/* bdi: שם לועזי ("Y.PL.") או תיאור שמסתיים במילה לועזית לא יהפכו את סדר הנקודות והסוגריים */}
      <bdi className={cx('min-w-0', linked && 'text-on-surface')}>{person.name}</bdi>
      {person.description && (
        <span className="min-w-0 font-normal opacity-80">(<bdi>{person.description}</bdi>)</span>
      )}
    </>
  )
}

/**
 * אדם ברשימה (בתוכנה: _InfoChip), בלי אייקון — האייקון החוזר בכל שבב רק העמיס.
 * עם קישור — שבב ui/Chip (מסגרת, רקע, ריחוף, פוקוס, מטרת מגע 44px), קישור חיצוני בחלון חדש;
 * בלי קישור — שם שטוח (STATIC_NAME). כך ההבדל בין לחיץ ללא-לחיץ ברור במבט.
 */
export default function PersonChip({ person }: { person: Person }) {
  if (isLinkable(person.url)) {
    return (
      <a href={person.url} target="_blank" rel="noopener noreferrer" className={chipClasses({ className: 'h-auto py-1.5' })}>
        <Content person={person} linked />
        <NewWindowHint />
      </a>
    )
  }
  return (
    <span className={cx(STATIC_NAME, 'py-1.5')}>
      <Content person={person} linked={false} />
    </span>
  )
}
