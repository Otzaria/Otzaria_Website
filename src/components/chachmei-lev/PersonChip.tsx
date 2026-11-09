import AppIcon from '@/components/ui/AppIcon'
import NewWindowHint from '@/components/ui/NewWindowHint'
import { chipClasses } from '@/components/ui/Chip'
import { cx } from '@/components/ui/cx'
import { isLinkable } from '@/lib/chachmei-lev-data'

export type Person = { name: string; url?: string; description?: string }

/** שבב שאינו לחיץ — אותו מראה כמו השבב הרגיל, בלי ריחוף (לא מרמז על פעולה) */
const STATIC_CHIP =
  'inline-flex min-h-(--chip-height) max-w-full items-center gap-1.5 rounded-(--chip-radius) border border-(--chip-border) bg-(--chip-bg) px-3.5 text-label-md text-(--chip-fg)'

function Content({ person, icon, linked }: { person: Person; icon: string; linked: boolean }) {
  return (
    <>
      <AppIcon name={icon} className={cx('text-[1.15rem]', linked ? 'text-primary' : 'opacity-70')} />
      {/* bdi: שם לועזי ("Y.PL.") או תיאור שמסתיים במילה לועזית לא יהפכו את סדר הנקודות והסוגריים */}
      <bdi className={cx('min-w-0', linked && 'text-on-surface')}>{person.name}</bdi>
      {person.description && (
        <span className="min-w-0 font-normal opacity-80">(<bdi>{person.description}</bdi>)</span>
      )}
    </>
  )
}

/**
 * שבב אדם (בתוכנה: _InfoChip): אייקון, שם, ותיאור בסוגריים. עם קישור — קישור חיצוני בחלון חדש
 * בעיצוב ui/Chip (chipClasses: ריחוף, פוקוס, מטרת מגע 44px); בלי קישור — שבב סטטי.
 * השם מודגש בצבע הטקסט והאייקון ב-primary כשיש קישור — כמו בתוכנה, שם הקישור בצבע ה-primary.
 */
export default function PersonChip({ person, icon = 'person' }: { person: Person; icon?: string }) {
  if (isLinkable(person.url)) {
    return (
      <a href={person.url} target="_blank" rel="noopener noreferrer" className={chipClasses({ className: 'h-auto py-1.5' })}>
        <Content person={person} icon={icon} linked />
        <NewWindowHint />
      </a>
    )
  }
  return (
    <span className={cx(STATIC_CHIP, 'py-1.5')}>
      <Content person={person} icon={icon} linked={false} />
    </span>
  )
}
