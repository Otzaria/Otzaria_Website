import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import FeatureCard from './FeatureCard'

// Server Component: תוכן סטטי לגמרי, בלי JavaScript בדפדפן (בלי framer-motion — ראו
// היסטוריה). בעיצוב "האפליקציה עצמה" הכרטיסים הם AppCard: בלי מסגרת ובלי צל, אריח
// אייקון טונלי, וריחוף שקט (cardSelectionOverlay) במקום הרמה והגדלה.
const features = [
  {
    icon: 'auto_stories',
    title: 'אלפי ספרים',
    description: 'ספרי קודש רבים זמינים לקריאה וללימוד'
  },
  {
    icon: 'verified',
    title: 'הקפדה על הנוסח',
    description: 'עבודת הגהה מתמשכת לדיוק נוסח הספרים'
  },
  {
    icon: 'search',
    title: 'חיפוש מהיר',
    description: 'מצא כל פסוק, מאמר או מושג בקלות'
  },
  {
    icon: 'edit_note',
    title: 'בעזרת מתנדבים',
    description: 'ספרים רבים נוספו והוגהו בידי מתנדבים'
  },
  {
    icon: 'devices',
    title: 'במערכות הפעלה מרובות',
    description: 'עובד על Windows, Linux, Android, iOS ו-macOS'
  },
  {
    icon: 'palette',
    title: 'תצוגה נוחה',
    description: 'תצוגה נקייה ופשוטה, עם מצב כהה והתאמה אישית'
  },
  {
    icon: 'description',
    title: 'קבצים נוספים',
    description: 'אפשר לפתוח גם קבצי TXT, DOCX ו-PDF'
  },
  {
    icon: 'volunteer_activism',
    title: 'חינם לחלוטין',
    description: 'התוכנה חינמית לחלוטין ותישאר כזו לעד'
  }
]

export default function FeaturesSection() {
  return (
    <Section id="features" labelledBy="features-heading" anchor>
      <SectionHeading
        id="features-heading"
        title="מה יש באוצריא?"
        subtitle="ספרי קודש רבים, לימוד נוח וחיפוש מהיר — הכל בחינם"
      />

      {/* נייד: עמודה אחת; טבלט: שתיים; דסקטופ רחב: ארבע. הכניסה המדורגת ב-CSS
          (הכרטיסים כבר ב-HTML של השרת, לא מחכים ל-hydration). */}
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {features.map((feature, index) => (
          <li key={feature.title} className="flex">
            <FeatureCard {...feature} index={index} />
          </li>
        ))}
      </ul>
    </Section>
  )
}
