import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import GuideBody from '@/components/pageProof/guide/GuideBody'
import { DEFAULT_GUIDE_HTML, renderGuide } from '@/lib/pageProof/guideContent'
import { loadGuide } from '@/lib/pageProof/guideStore'

// הנחיות להגהת עמודים — דף אחד קצר למתנדבים, עם תמונות (שרטוטים סינתטיים — GuideFigures). ציבורי (בלי התחברות),
// כדי שאפשר יהיה לקשר אליו מהפורום; העורך מקשר אליו מהסרגל ("הנחיות") ומחלון העזרה (helpTexts.GUIDE_PATH).
// הכללים כאן הם "הקו האחיד" שבעל הפרויקט קבע (2026-10-05), במקום תשובות פזורות באשכול.
// התוכן נערך מדף הניהול (בעל הפרויקט, 2026-10-06 — בלי בקשת-שינוי לכל הגהה): הנוסח השמור (guideStore — מטמון עם תגית,
// מתבטל בכל שמירה), ובלעדיו — הנוסח המקורי (guideContent.DEFAULT_GUIDE_HTML). שמות הכפתורים של שני השלבים מגיעים מהקודים
// [[כפתור:…]] — אותו נוסח כמו בעורך (lib/pageProof/stages.js, STAGE_TEXT).

export const metadata = {
  title: 'הנחיות להגהת עמודים - אוצריא',
  description: 'דף אחד קצר למתנדבי הגהת העמודים: מסגרות, ריהוט, חיתוך שורות, טקסט, פגם בדפוס, סגנונות, פסקאות, קישורים וזמנים.',
}

// הנוסח השמור מתעדכן במטמון עם תגית; כאן — רשת-ביטחון של 5 דקות לדף עצמו
export const revalidate = 300

export default async function PageProofGuidePage() {
  const saved = await loadGuide()
  const { html, toc } = renderGuide(saved?.html || DEFAULT_GUIDE_HTML)
  return (
    <div className="min-h-screen bg-background">
      <OtzariaSoftwareHeader />

      <main className="px-4 py-12">
        <div className="container mx-auto max-w-4xl space-y-8">
          <div className="flex items-center gap-2 text-sm text-on-surface/60">
            <Link href="/" prefetch={false} className="hover:text-primary">
              בית
            </Link>
            <span>›</span>
            <Link href="/docs" className="hover:text-primary">
              מדריכים
            </Link>
            <span>›</span>
            <span className="text-on-surface">הנחיות להגהת עמודים</span>
          </div>

          <div className="glass-strong rounded-2xl border-4 border-primary p-10 text-center">
            <span aria-hidden="true" className="material-symbols-outlined mb-4 block text-7xl text-primary">
              fact_check
            </span>
            <h1 className="mb-4 font-frank text-4xl font-bold text-primary-dark">הנחיות להגהת עמודים</h1>
            {toc.length > 0 && (
              <nav aria-label="תוכן הדף" className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
                {toc.map((t) => (
                  <a key={t.href} href={t.href} className="rounded-full bg-surface-variant/60 px-3 py-1 hover:bg-surface-variant">
                    {t.label}
                  </a>
                ))}
              </nav>
            )}
          </div>

          <GuideBody html={html} />
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}
