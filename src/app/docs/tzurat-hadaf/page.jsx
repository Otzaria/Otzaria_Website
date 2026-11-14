import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import TzuratGuideBody from '@/components/tzuratHadaf/TzuratGuideBody'
import { DEFAULT_GUIDE_HTML, renderGuide } from '@/lib/tzuratHadaf/guideContent'
import { loadGuide } from '@/lib/tzuratHadaf/guideStore'
import { pageMetadata } from '@/lib/seo'

// הנחיות למתנדבי צורת הדף — דף ציבורי (בלי התחברות), כדי שאפשר יהיה לקשר אליו מהפורום ומחלונות העזרה במודול.
// התוכן נערך מדף הניהול (guideStore — מטמון עם תגית, מתבטל בכל שמירה), ובלעדיו — הנוסח המקורי (guideContent).
// כמו /docs/page-proof.

export const metadata = pageMetadata({
  title: 'הנחיות לצורת הדף',
  description: 'השוואת עמודי הגמרא של אוצריא לדפוס וילנא: החלטות נוסח מהירות, בדיקת עמוד, שבירת שורות ודיווחים.',
  path: '/docs/tzurat-hadaf',
})

// הנוסח השמור מתעדכן במטמון עם תגית; כאן — רשת ביטחון של 5 דקות לדף עצמו
export const revalidate = 300

export default async function TzuratGuidePage() {
  const saved = await loadGuide()
  const { html, toc } = renderGuide(saved?.html || DEFAULT_GUIDE_HTML)
  return (
    <div className="min-h-screen bg-background">
      <OtzariaSoftwareHeader />

      <main id="main-content" className="px-4 py-12">
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
            <span className="text-on-surface">הנחיות לצורת הדף</span>
          </div>

          <div className="glass-strong rounded-2xl border-4 border-primary p-10 text-center">
            <span aria-hidden="true" className="material-symbols-outlined mb-4 block text-7xl text-primary">
              auto_stories
            </span>
            <h1 className="mb-4 font-frank text-4xl font-bold text-primary-dark">הנחיות לצורת הדף</h1>
            <p className="text-lg text-on-surface/75">
              <Link href="/library/tzurat-hadaf" prefetch={false} className="font-bold text-primary hover:underline">
                להשתתפות בבדיקה
              </Link>
            </p>
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

          <TzuratGuideBody html={html} />
        </div>
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  )
}
