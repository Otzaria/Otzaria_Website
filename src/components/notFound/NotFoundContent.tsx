import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import Section from '@/components/ui/Section'
import EmptyShelfIllustration from './EmptyShelfIllustration'
import NotFoundLinks from './NotFoundLinks'
import ReportBrokenLink from './ReportBrokenLink'
import { NOT_FOUND_LINKS, type NotFoundContext } from './notFoundLinkData'

export const NOT_FOUND_TITLE = 'הדף שחיפשת אינו כאן'
export const NOT_FOUND_SUBTITLE = 'ייתכן שהדף הועבר, או שהקישור שהגעת ממנו אינו מדויק.'

/**
 * תוכן דף 404 (בלי המעטפת: הכותרת העליונה, <main> והפוטר שייכים לעמוד שמשתמש בו).
 * מבנה: איור המדף · כותרת העמוד (h1 + קישוט) · הפעולה הראשית "לדף הבית" · דרכי המשך · דיווח.
 * context — 'site' (ברירת המחדל) או 'library': סדר דרכי ההמשך (ראו notFoundLinkData.ts).
 * Server Component (בלי hooks).
 */
export default function NotFoundContent({ context = 'site' }: { context?: NotFoundContext }) {
  return (
    <Section labelledBy="not-found-title" container="narrow" spacing="top">
      <div className="flex flex-col items-center">
        <EmptyShelfIllustration className="mb-8 max-w-56 text-primary md:max-w-64" />

        <PageHeader
          id="not-found-title"
          title={NOT_FOUND_TITLE}
          subtitle={NOT_FOUND_SUBTITLE}
          actions={
            <Button href="/" size="lg" icon="home">
              לדף הבית
            </Button>
          }
        />

        <NotFoundLinks links={NOT_FOUND_LINKS[context]} />

        <ReportBrokenLink className="mt-8" />
      </div>
    </Section>
  )
}
