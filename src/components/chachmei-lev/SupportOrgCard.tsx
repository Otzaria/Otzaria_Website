import Image from 'next/image'
import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { orgDetailLines, splitBold, telHref } from '@/lib/chachmei-lev-data'

export type SupportOrg = {
  name: string
  phone: string
  logo: string
  phones?: string[]
  registeredCount?: number
  details?: string[]
}

/**
 * כרטיס ארגון סיוע (בתוכנה: _ExpandableOrgCard): לוגו, שם וטלפון לחיוג, ו"אפשרויות הקו" במקפל
 * שטוח — קו מפריד דק בלבד, בלי משטח משלו (כרטיס בתוך כרטיס בתוך כרטיס הסיוע היה עמוס מדי)
 * (details/summary — בלי JavaScript; Ctrl+F מוצא גם תוכן סגור). הטלפון מחוץ ל-summary — קישור
 * בתוך summary הוא אלמנט אינטראקטיבי מקונן. משטח טונלי בלי מסגרת וצל — הכרטיס יושב בתוך כרטיס
 * הסיוע, ומסגרת נוספת לכל ארגון יצרה רשת של קווים. emergency — קו חירום: הטלפון וההדגשות בצבע השגיאה.
 */
export default function SupportOrgCard({ org, emergency = false }: { org: SupportOrg; emergency?: boolean }) {
  const lines = orgDetailLines(org)
  const accent = emergency ? 'text-error' : 'text-primary'
  return (
    <Card as="li" tone="tonal" padding="sm" className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {/* משטח בהיר קבוע — רוב הלוגואים על רקע לבן */}
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-container-low dark:bg-on-surface">
          <Image src={org.logo} alt="" width={48} height={48} className="size-12 object-contain" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-title-sm text-on-surface">{org.name}</h4>
          <a
            href={telHref(org.phone)}
            dir="ltr"
            className={cx('inline-flex min-h-(--touch-target) items-center rounded-control text-title-md tabular-nums tracking-wide underline-offset-4 hover:underline', accent, FOCUS_RING)}
          >
            <span className="sr-only">חיוג ל{org.name}: </span>
            {org.phone}
          </a>
        </div>
      </div>

      {(lines.length > 0 || (org.phones?.length ?? 0) > 0) && (
        <details className="group/org border-t border-outline-variant">
          <summary
            className={cx(
              'flex min-h-(--touch-target) cursor-pointer list-none items-center gap-2 rounded-control px-1 text-label-md text-on-surface-variant transition-colors hover:text-on-surface [&::-webkit-details-marker]:hidden',
              FOCUS_RING
            )}
          >
            <span className="flex-1">אפשרויות הקו</span>
            <AppIcon
              name="expand_more"
              className="text-xl transition-transform ease-standard group-open/org:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <div className="px-1 pb-1 text-body-sm text-on-surface-variant">
            {org.phones && org.phones.length > 0 && (
              <ul className="mb-2">
                {org.phones.map((phone) => (
                  <li key={phone} dir="ltr" className="text-end tabular-nums">{phone}</li>
                ))}
              </ul>
            )}
            {lines.map((line, index) =>
              line === '' ? (
                <span key={index} aria-hidden="true" className="block h-2" />
              ) : (
                <p key={index}>
                  {splitBold(line).map((segment, i) =>
                    segment.bold
                      ? <strong key={i} className={cx('font-bold', emergency ? 'text-error' : 'text-on-surface')}>{segment.text}</strong>
                      : <span key={i}>{segment.text}</span>
                  )}
                </p>
              )
            )}
          </div>
        </details>
      )}
    </Card>
  )
}
