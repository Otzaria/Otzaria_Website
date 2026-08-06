import Header from '@/components/layout/Header'
import Link from 'next/link'

export default function LicensePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="glass-strong rounded-3xl p-8 md:p-12 shadow-xl border border-surface-variant animate-enter-up">
            <h1 className="text-4xl font-bold text-primary mb-8 font-frank border-b pb-4">
              רישיון שימוש
            </h1>

            <section className="space-y-10 text-on-surface/80 leading-relaxed">
              <div>
                <h2 className="text-2xl font-bold text-on-surface mb-4">מבוא</h2>
                <p>
                  פרויקט זה הוא מיזם שמטרתו עריכת טקסטים והנגשתם לציבור.
                  התכנים מופצים תחת רישיון פתוח כדי לאפשר שימוש רחב ככל הניתן.
                </p>
              </div>

              <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
                <h2 className="text-2xl font-bold text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">gavel</span>
                  תנאי הרישיון (License)
                </h2>

                <div className="p-6 rounded-xl border border-surface-variant/50 mb-6 bg-surface/50">
                  <p className="mb-4 font-bold">
                    התוכן המקורי שנוצר במסגרת פרויקט זה (כגון: סקריפטים, כלי עיבוד, קבצי מטא־דאטה שנוצרו על ידינו, וקבצי עזר) מופץ תחת הרישיון:
                  </p>
                  <p className="dir-ltr text-left font-mono text-primary mb-6">
                    CC BY-NC-SA 4.0 — Creative Commons Attribution‑NonCommercial‑ShareAlike 4.0 International
                  </p>
                  
                  <h3 className="text-lg font-bold mb-3 border-t pt-4">המשמעות בקצרה:</h3>
                  <ul className="list-disc list-inside space-y-2">
                    <li>מותר להעתיק, להפיץ, ולערוך</li>
                    <li>חובה לתת קרדיט מתאים</li>
                    <li>אסור שימוש מסחרי</li>
                    <li>כל יצירה נגזרת חייבת להיות מופצת תחת אותו רישיון (ShareAlike)</li>
                  </ul>
                </div>

                <div className="flex items-center gap-2 text-sm bg-surface p-3 rounded-lg border border-surface-variant/50">
                   <span className="material-symbols-outlined text-primary text-lg">info</span>
                   <p>
                    לצפייה ברשיון המאגר המלא:{' '}
                    <Link href="/license" className="text-primary font-bold hover:underline">
                      לחצו כאן
                    </Link>
                  </p>
                </div>
              </div>

              <div className="pt-8 border-t border-surface-variant text-center">
                <p className="mb-4">יש לך שאלות נוספות בנוגע לרישיון?</p>
                <a 
                  href="/forum" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-accent transition-colors font-bold"
                >
                  <span className="material-symbols-outlined">forum</span>
                  פנה אלינו בפורום
                </a>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}

