import Card from '@/components/ui/Card'
import Section from '@/components/ui/Section'
import TitleOrnament from '@/components/ui/TitleOrnament'

/**
 * מובאה ממורכזת (figure בכרטיס טונלי): המובאה בגופן התצוגה, הקישוט ממורכז מתחתיה וצמוד אליה,
 * ההסבר, והמקור (figcaption). Section בלי labelledBy — <section> בלי שם אינו landmark, וזה
 * המכוון: זו הפסקה בין האזורים, לא אזור ניווט. טבעת הקישוט בצבע האטום של הכרטיס הטונלי.
 */
export default function SourceQuote({ quote, explanation, source }: {
  quote: string
  explanation: string
  source: string
}) {
  return (
    <Section spacing="top" container="narrow">
      <Card tone="tonal" padding="lg">
        <figure className="flex flex-col items-center text-center">
          <div className="flex w-fit max-w-full flex-col">
            <blockquote className="text-balance font-display text-headline-md text-primary md:text-headline-lg">
              <p>{quote}</p>
            </blockquote>
            <TitleOrnament className="mt-4" ringColor="var(--card-bg-tonal-solid)" />
          </div>
          <p className="mt-4 text-body-lg text-on-surface">{explanation}</p>
          <figcaption className="mt-1 text-body-sm text-on-surface-variant">{source}</figcaption>
        </figure>
      </Card>
    </Section>
  )
}
