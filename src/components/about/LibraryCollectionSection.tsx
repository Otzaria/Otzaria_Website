import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'

// תחומי הספרייה — כל תחום בכרטיס קטן עם אריח ספר
export const LIBRARY_SECTIONS = [
  'תנ"ך ומפרשיו',
  'משנה ומפרשיה',
  'תלמודים בבלי וירושלמי עם ראשונים ואחרונים',
  'ספרי הלכה כולל טושו"ע וכל נושאי הכלים',
  'ספרי מחשבה ומוסר',
  'ספרי קבלה'
]

/** "ספריית אוצריא": היקף הספרייה (בשורת המשנה, בלי מספר קבוע — המספר העדכני בדף הבית) ותחומיה ברשת כרטיסים — טור אחד בנייד, עד שלושה בדסקטופ */
export default function LibraryCollectionSection() {
  return (
    <Section labelledBy="library-heading" spacing="top">
      <SectionHeading
        id="library-heading"
        title="ספריית אוצריא"
        subtitle="הספרייה מונה אלפי ספרים, ובהם רוב ספרי היסוד:"
      />
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {LIBRARY_SECTIONS.map((section) => (
          <Card key={section} as="li" padding="sm" className="flex items-center gap-3">
            <IconTile icon="menu_book" size="sm" />
            <span className="min-w-0 text-body-md text-on-surface">{section}</span>
          </Card>
        ))}
      </ul>
    </Section>
  )
}
