import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import FeatureCard from './FeatureCard'

// Server Component: תוכן סטטי לגמרי, בלי JavaScript בדפדפן (בלי framer-motion — ראו
// היסטוריה). בעיצוב "האפליקציה עצמה" הכרטיסים הם AppCard: בלי מסגרת ובלי צל, אריח
// אייקון טונלי, וריחוף שקט (cardSelectionOverlay) במקום הרמה והגדלה.
const features = [
  {
    icon: 'auto_stories',
    title: 'מאגר עצום',
    description: 'אלפי ספרי קודש זמינים לקריאה ולימוד'
  },
  {
    icon: 'verified',
    title: 'דיוק מקסימלי',
    description: 'מערכת בקרת איכות מתקדמת לטקסטים מדויקים'
  },
  {
    icon: 'search',
    title: 'חיפוש מתקדם',
    description: 'מצא כל פסוק, מאמר או מושג בקלות'
  },
  {
    icon: 'edit_note',
    title: 'עריכה משותפת',
    description: 'ספרים רבים נוספו על ידי הקהילה'
  },
  {
    icon: 'devices',
    title: 'פלטפורמות מרובות',
    description: 'עובד על Windows, Linux, Android, iOS ו-macOS'
  },
  {
    icon: 'palette',
    title: 'ממשק מודרני',
    description: 'עיצוב נקי ופשוט עם תמיכה במצב כהה ובהתאמה אישית'
  },
  {
    icon: 'description',
    title: 'פורמטים מגוונים',
    description: 'תמיכה בקבצי TXT, DOCX ו-PDF'
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
        title="למה לבחור באוצריא?"
        subtitle="פלטפורמה מתקדמת המשלבת טכנולוגיה חדישה עם כבוד למסורת"
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
