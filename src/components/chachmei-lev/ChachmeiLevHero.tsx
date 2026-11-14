import Image from 'next/image'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import QuickNav from './QuickNav'
import QuoteFigure from './QuoteFigure'

/**
 * פתיחת הדף: הסמל של אוצריא (כמו בפתיחת /about), כותרת העמוד (h1 + קישוט), הציטוט והניווט המהיר.
 * הסמל — במידות הטבעיות של הקובץ (256×234, לא ריבועי) עם גובה קבוע ו-w-auto, כדי שלא יימתח; eager ועדיפות גבוהה (הוא בראש הדף); alt ריק: דקורטיבי ליד h1. קומפקטית בכוונה —
 * לוח ההנצחה שאחריה הוא לב הדף, ותחילתו צריכה להיראות במחשב בלי גלילה. בלי ריפוד תחתון — הרווח
 * עד האזור הבא הוא הריפוד העליון שלו. בלי אנימציית כניסה: הכותרת היא ה-LCP.
 */
export default function ChachmeiLevHero({ titleId = 'chachmei-lev-title' }: { titleId?: string }) {
  return (
    <Section labelledBy={titleId} container="narrow" spacing="none" className="pt-8 md:pt-10 short:pt-6">
      <div className="mb-3 flex justify-center">
        <Image src="/logo.png" alt="" width={256} height={234} loading="eager" fetchPriority="high" className="h-14 w-auto md:h-16" />
      </div>
      {/* כמו ui/PageHeader (h1 עם קישוט), אבל עם מרווח תחתון קצר — PageHeader לא מאפשר לשנות אותו */}
      <SectionHeading
        as="h1"
        id={titleId}
        title="חכמי לב"
        subtitle="הכרת הטוב לכל מי שנטל חלק במלאכת הקודש של אוצריא"
        spacing="none"
        className="mb-6"
      />
      <QuoteFigure />
      <QuickNav className="mt-6" />
    </Section>
  )
}
