import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import FaqList from '@/components/faq/FaqList'
import IconTile from '@/components/ui/IconTile'
import PageHeader from '@/components/ui/PageHeader'
import Section from '@/components/ui/Section'
import { categories, faqs } from '@/lib/faq-data'

// עיצוב כיוון א' (כמו /offline ו-/docs): אריח אייקון, כותרת + קישוט, ומתחתיה השאלות מקובצות לפי
// קטגוריה. רכיב שרת: רק רשימת השאלות (סינון + עוגנים) רצה בדפדפן. בלי אנימציית כניסה — הכותרת
// היא אלמנט ה-LCP.
export default function FAQPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-on-surface">
      <OtzariaSoftwareHeader />

      <main id="main-content" className="flex-1">
        <Section labelledBy="faq-title" container="narrow" spacing="none" className="pt-10 pb-14 md:pt-14 md:pb-16">
          <div className="mb-4 flex justify-center">
            <IconTile icon="quiz" size="lg" />
          </div>
          <PageHeader id="faq-title" title="שאלות נפוצות" subtitle="מענה לשאלות הנפוצות ביותר על תוכנת אוצריא" />
          <FaqList categories={categories} faqs={faqs} />
        </Section>
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  )
}
