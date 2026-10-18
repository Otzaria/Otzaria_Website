import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import NewWindowHint from '@/components/ui/NewWindowHint'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'

export type ExternalSource = { href: string; label: string }

export const MORE_SOURCES: ExternalSource[] = [
  { href: 'https://oraita.net/', label: 'אורייתא' },
  { href: 'http://mobile.tora.ws/', label: 'ובלכתך בדרך' },
  { href: 'https://www.toratemetfreeware.com/online/', label: 'תורת אמת' },
  { href: 'https://wiki.jewishbooks.org.il/', label: 'אוצר הספרים היהודי השיתופי' },
  { href: 'https://pninim.org/', label: 'פנינים' }
]

/**
 * "מקורות נוספים" — כרטיס באותו מבנה כמו ui/InfoCard (אריח + h3), ובו רשימת קישורים חיצוניים.
 * כל קישור בגובה מטרת המגע (44px), עם טבעת הפוקוס, אייקון "חלון חדש" ורמז לקוראי מסך.
 */
export default function MoreSourcesCard({ sources = MORE_SOURCES, as = 'div', className }: {
  sources?: ExternalSource[]
  as?: 'div' | 'li'
  className?: string
}) {
  return (
    <Card as={as} padding="md" className={cx('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-3">
        <IconTile icon="link" size="md" />
        <h3 className="min-w-0 text-title-md text-on-surface">מקורות נוספים:</h3>
      </div>
      {/* שני טורים רק כשהכרטיס רחב: בנייד-רחב (טור כרטיסים אחד) ומ-xl; ב-md–lg הכרטיס חצי רוחב */}
      <ul className="grid sm:grid-cols-2 sm:gap-x-4 md:grid-cols-1 xl:grid-cols-2">
        {sources.map((source) => (
          <li key={source.href}>
            <a
              href={source.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cx(
                'inline-flex min-h-(--touch-target) items-center gap-2 rounded-control text-body-md text-primary underline-offset-4 hover:underline',
                FOCUS_RING
              )}
            >
              {source.label}
              <NewWindowHint />
              <AppIcon name="open_in_new" className="shrink-0 text-lg" />
            </a>
          </li>
        ))}
      </ul>
    </Card>
  )
}
