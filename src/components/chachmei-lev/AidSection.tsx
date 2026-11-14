import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING_INSET } from '@/components/ui/focusRing'
import { AID, EMERGENCY_LINES, SUPPORT_ORGS } from '@/lib/chachmei-lev-data'
import SupportOrgCard, { type SupportOrg } from './SupportOrgCard'

function OrgGroup({ id, title, orgs, emergency = false }: {
  id: string
  title: string
  orgs: SupportOrg[]
  emergency?: boolean
}) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className={cx('mb-3 flex items-center gap-2 text-title-md', emergency ? 'text-error' : 'text-on-surface')}>
        <AppIcon name={emergency ? 'phone_in_talk' : 'groups'} className="text-xl" />
        {title}
      </h3>
      <ul className="grid gap-3 sm:grid-cols-2">
        {orgs.map((org) => <SupportOrgCard key={org.name} org={org} emergency={emergency} />)}
      </ul>
    </section>
  )
}

/**
 * "סיוע ללומדי תורה": בתוכנה — שורה עם כפתור "למידע נוסף" שפותח חלון עם קווי החירום וארגוני
 * הסיוע. כאן — אותו מבנה בכרטיס מקפל (details/summary, בלי JavaScript): הכותרת והתיאור גלויים,
 * והרשימה נפתחת במקום. כך האזור נשאר קצר.
 */
export default function AidSection() {
  return (
    <Section id="aid" labelledBy="aid-heading" anchor spacing="top" container="narrow">
      <SectionHeading id="aid-heading" title={AID.heading} />
      <Card tone="raised" padding="none" className="overflow-hidden">
        <details className="group/aid">
          <summary
            className={cx(
              'flex min-h-(--touch-target) cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-3 p-4 transition-colors hover:bg-(--card-bg-hover) sm:p-5 [&::-webkit-details-marker]:hidden',
              FOCUS_RING_INSET
            )}
          >
            <span className="flex min-w-0 flex-1 basis-64 items-center gap-3">
              <IconTile icon="shield" size="md" />
              <span className="min-w-0">
                <span className="block text-title-md text-on-surface">{AID.title}</span>
                <span className="block text-body-sm text-on-surface-variant">{AID.subtitle}</span>
              </span>
            </span>
            {/* מראה של כפתור טונלי על span — ה-summary עצמו הוא האלמנט האינטראקטיבי */}
            <span className={buttonClasses({ variant: 'tonal', size: 'sm' })}>
              <span className="group-open/aid:hidden">למידע נוסף</span>
              <span className="hidden group-open/aid:inline">הסתרת המידע</span>
              <AppIcon
                name="expand_more"
                className="text-lg transition-transform ease-standard group-open/aid:rotate-180 motion-reduce:transition-none"
              />
            </span>
          </summary>
          <div className="flex flex-col gap-8 border-t border-outline-variant p-4 sm:p-5">
            <OrgGroup id="aid-emergency" title={AID.emergencyLabel} orgs={EMERGENCY_LINES} emergency />
            <OrgGroup id="aid-support" title={AID.supportLabel} orgs={SUPPORT_ORGS} />
          </div>
        </details>
      </Card>
    </Section>
  )
}
