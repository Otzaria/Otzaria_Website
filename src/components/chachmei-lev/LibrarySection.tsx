import Card from '@/components/ui/Card'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { CONTACT_EMAIL } from '@/components/notFound/notFoundLinkData'
import {
  ADDITIONAL_SOURCES,
  ADDITIONAL_SOURCES_LABEL,
  EDITOR_GROUPS,
  EDITORS_NOTE,
  LIBRARY_INTRO,
  MAIN_SOURCES,
  MAIN_SOURCES_LABEL
} from '@/lib/chachmei-lev-data'
import PeopleList from './PeopleList'
import SourceCard from './SourceCard'

/**
 * "אודות ספריית אוצריא": מקור הספרים (המקורות הראשיים בכרטיסים גדולים, הנוספים ברשת לוגואים)
 * ומהדירי הספרים בשתי הדרגות, עם ההערה למי ששמו חסר. תת-הכותרות (h3) בגופן התצוגה.
 */
export default function LibrarySection() {
  return (
    <Section id="library" labelledBy="library-heading" anchor spacing="top">
      <SectionHeading id="library-heading" title="אודות ספריית אוצריא" />

      <section aria-labelledby="sources-heading">
        <SectionHeading id="sources-heading" as="h3" size="md" title="מקור הספרים" subtitle={LIBRARY_INTRO} className="mb-6 md:mb-8" />
        <p className="mx-auto mb-4 max-w-measure text-balance text-center text-body-md text-on-surface-variant">{MAIN_SOURCES_LABEL}</p>
        <ul className="mx-auto grid max-w-narrow gap-3 sm:grid-cols-2 sm:gap-4">
          {MAIN_SOURCES.map((source) => <SourceCard key={source.name} source={source} size="lg" />)}
        </ul>
        <p className="mx-auto mb-4 mt-10 max-w-measure text-balance text-center text-body-md text-on-surface-variant">{ADDITIONAL_SOURCES_LABEL}</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ADDITIONAL_SOURCES.map((source) => <SourceCard key={source.name} source={source} />)}
        </ul>
      </section>

      <section aria-labelledby="editors-heading" className="mt-14 md:mt-20">
        <SectionHeading id="editors-heading" as="h3" size="md" title="מהדירי ספרים" className="mb-6 md:mb-8" />
        <Card padding="lg" className="mx-auto flex max-w-narrow flex-col gap-8">
          {EDITOR_GROUPS.map((group) => (
            <PeopleList key={group.label} label={group.label} people={group.editors} icon="edit_note" />
          ))}
        </Card>
        <p className="mx-auto mt-6 max-w-measure text-balance text-center text-body-sm text-on-surface-variant">
          {EDITORS_NOTE}{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            dir="ltr"
            className={cx('inline-flex min-h-(--touch-target) items-center rounded-control text-primary underline underline-offset-4', FOCUS_RING)}
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </section>
    </Section>
  )
}
