import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import { cx } from '@/components/ui/cx'

/** דף התרומה בדולרים (נדבות) — קישור חיצוני, נפתח בלשונית חדשה. http מפנה ל-https, ולכן https ישירות. */
export const NEDAVOS_DOLLAR_URL = 'https://nedavos.org/8526'

/**
 * אפשרות התרומה בדולרים: כרטיס באותו מבנה כמו כרטיסי הקישור החיצוני באתר (DocsDevelopersCard) —
 * אריח האייקון, כותרת ושורת הסבר, וכפתור טונלי אחד. מוצג בין הערת המטבע לטופס נדרים פלוס,
 * כי ההערה ממליצה לא לתרום שם במטבע חוץ — וזו החלופה למי שתורם בדולרים.
 */
export default function DonateDollarOption({ className }: { className?: string }) {
  return (
    <Card tone="raised" padding="md" className={cx('flex flex-col gap-4 sm:flex-row sm:items-center', className)}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <IconTile custom="donate" size="md" />
        <div className="min-w-0">
          <p className="text-title-md text-on-surface">תרומה בדולרים</p>
          <p className="text-body-sm text-on-surface-variant">אפשר לתרום גם בדולרים, באמצעות אתר נדבות.</p>
        </div>
      </div>
      <Button href={NEDAVOS_DOLLAR_URL} external variant="tonal" icon="open_in_new" className="self-start sm:self-auto">
        לתרומה בדולרים
      </Button>
    </Card>
  )
}
