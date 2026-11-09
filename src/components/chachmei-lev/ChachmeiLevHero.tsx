import IconTile from '@/components/ui/IconTile'
import PageHeader from '@/components/ui/PageHeader'
import Section from '@/components/ui/Section'
import QuickNav from './QuickNav'
import QuoteFigure from './QuoteFigure'

/**
 * פתיחת הדף: אריח אייקון, כותרת העמוד (h1 + קישוט), הציטוט והניווט המהיר. בלי ריפוד תחתון — הרווח
 * עד האזור הבא הוא הריפוד העליון שלו (כמו /offline ו-/donate). בלי אנימציית כניסה: הכותרת היא ה-LCP.
 */
export default function ChachmeiLevHero({ titleId = 'chachmei-lev-title' }: { titleId?: string }) {
  return (
    <Section labelledBy={titleId} container="narrow" spacing="none" className="pt-10 md:pt-14 short:pt-8">
      <div className="mb-4 flex justify-center">
        <IconTile icon="volunteer_activism" size="lg" />
      </div>
      <PageHeader id={titleId} title="חכמי לב" subtitle="תודה והוקרה לכל מי שתרם מהונו ומזמנו לאוצריא" />
      <QuoteFigure />
      <QuickNav className="mt-8" />
    </Section>
  )
}
