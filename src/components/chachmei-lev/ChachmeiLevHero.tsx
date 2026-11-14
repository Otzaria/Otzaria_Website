import Image from 'next/image'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import QuickNav from './QuickNav'
import QuoteFigure from './QuoteFigure'

/**
 * פתיחת הדף: הסמל של אוצריא (כמו בפתיחת /about), כותרת העמוד (h1 + קישוט), הציטוט והניווט המהיר.
 * הסמל — eager ועדיפות גבוהה (הוא בראש הדף); alt ריק: דקורטיבי ליד h1. קומפקטית בכוונה —
 * לוח ההנצחה שאחריה הוא לב הדף, ותחילתו צריכה להיראות במחשב בלי גלילה. בלי ריפוד תחתון — הרווח
 * עד האזור הבא הוא הריפוד העליון שלו. בלי אנימציית כניסה: הכותרת היא ה-LCP.
 */
export default function ChachmeiLevHero({ titleId = 'chachmei-lev-title' }: { titleId?: string }) {
  return (
    <Section labelledBy={titleId} container="narrow" spacing="none" className="pt-8 md:pt-10 short:pt-6">
      <div className="mb-3 flex justify-center">
        <Image src="/logo.png" alt="" width={100} height={100} loading="eager" fetchPriority="high" className="size-14 md:size-16" />
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
