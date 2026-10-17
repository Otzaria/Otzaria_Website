import Button from '@/components/ui/Button'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'

/** סיום הדף: הזמנה לסייע לספרייה ופעולה ראשית אחת. בלי ריפוד תחתון — המרווח עד הפוטר הוא ה-mt שלו */
export default function JoinCallout() {
  return (
    <Section labelledBy="join-heading" spacing="top" container="narrow" containerClassName="flex flex-col items-center text-center">
      <SectionHeading
        id="join-heading"
        title="רוצה לקחת חלק?"
        subtitle={
          <>
            בעמוד <strong className="font-bold text-on-surface">עזור לספרייה</strong> יש כמה דרכים לסייע: העלאת ספרים, הגהת עמודים, הוספת מידע ועוד.
          </>
        }
        size="md"
        spacing="none"
        className="mb-6"
      />
      <Button href="/library" size="lg" icon="library_books">עזור לספרייה</Button>
    </Section>
  )
}
