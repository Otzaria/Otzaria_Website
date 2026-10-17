import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

/**
 * עמוד מסמך (רישיון, מדיניות פרטיות): המעטפת הציבורית, כרטיס הזכוכית עם הכותרת (h1), ובתוכו
 * <section> אחד שהפרקים (children) עומדים בו זה מתחת לזה. מבנה משותף ל-/license ול-/privacy.
 */
export default function LegalPage({ title, children }) {
  return (
    <div className="min-h-screen bg-background">
      <OtzariaSoftwareHeader />

      <main id="main-content" className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="glass-strong rounded-3xl p-8 md:p-12 shadow-xl border border-surface-variant animate-enter-up">
            <h1 className="text-4xl font-bold text-primary mb-8 font-frank border-b pb-4">{title}</h1>

            <section className="space-y-10 text-on-surface/80 leading-relaxed">{children}</section>
          </div>
        </div>
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  )
}

/** כותרת פרק (h2), עם אייקון אופציונלי בצבע הראשי לפניה */
export function LegalHeading({ icon, children }) {
  if (!icon) return <h2 className="text-2xl font-bold text-on-surface mb-4">{children}</h2>
  return (
    <h2 className="text-2xl font-bold text-on-surface mb-4 flex items-center gap-2">
      <span className="material-symbols-outlined text-primary">{icon}</span>
      {children}
    </h2>
  )
}

/** סיום המסמך: שאלה, קישור לפורום אוצריא, ותוכן נוסף אופציונלי מתחתיו (children) */
export function ForumContact({ question, children }) {
  return (
    <div className="pt-8 border-t border-surface-variant text-center">
      <p className="mb-4">{question}</p>
      <a
        href="/forum"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-accent transition-colors font-bold"
      >
        <span className="material-symbols-outlined">forum</span>
        פנה אלינו בפורום אוצריא
      </a>
      {children}
    </div>
  )
}
