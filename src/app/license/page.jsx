import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

// אותה נקודת קצה וחלון רענון (פעם בשעה) כמו ב-/api/license, אך נטענת ישירות
// בצד השרת כדי למנוע מסך טעינה ו-JavaScript מיותר בצד הלקוח.
async function fetchLicenseText() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/Otzaria/otzaria/main/LICENSE', {
      next: { revalidate: 3600 } // רענון פעם בשעה
    })

    if (!res.ok) {
      throw new Error('Failed to fetch license from GitHub')
    }

    return await res.text()
  } catch (error) {
    console.error('License fetch error:', error)
    return null
  }
}

export default async function LicensePage() {
  const licenseText = await fetchLicenseText()
  const error = licenseText === null

  return (
    <div className="min-h-screen bg-background">
      <OtzariaSoftwareHeader />

      <main className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="glass-strong rounded-3xl p-8 md:p-12 shadow-xl border border-surface-variant animate-enter-up">
            <h1 className="text-4xl font-bold text-primary mb-8 font-frank border-b pb-4">
              רישיון שימוש - אוצריא (Otzaria)
            </h1>

            <section className="space-y-10 text-on-surface/80 leading-relaxed">
              <div>
                <h2 className="text-2xl font-bold text-on-surface mb-4">מבוא</h2>
                <p>
                  פרויקט "אוצריא" הוא מיזם שמטרתו הנגשת ספרי קודש לציבור.
                  התוכנה מופצת תחת <strong>Personal Use License 1.0</strong> — רישיון שימוש אישי בלבד.
                  הספרייה (הספרים והתכנים) מופצת תחת רישיון נפרד — <a href="/library/license" className="text-primary hover:underline">לפרטים לחצו כאן</a>.
                </p>
              </div>

              <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
                <h2 className="text-2xl font-bold text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">gavel</span>
                  תנאי הרישיון (License)
                </h2>


                <div className="p-4 rounded-xl border border-surface-variant/50 mb-6 dir-ltr text-left font-sans text-sm text-on-surface/90">
                  {error ? (
                    <div className="text-danger-500 text-center py-4">
                      <p>לא ניתן היה לטעון את הרישיון.</p>
                      <a
                        href="https://github.com/Otzaria/otzaria/blob/main/LICENSE"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        לחץ כאן לצפייה במקור
                      </a>
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono leading-relaxed">
                      {licenseText}
                    </pre>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm bg-surface p-3 rounded-lg border border-surface-variant/50">
                   <span className="material-symbols-outlined text-primary text-lg">info</span>
                   <p>
                    לצפייה בקובץ הרישיון המקורי והעדכני ב-GitHub:{' '}
                    <a
                      href="https://github.com/Otzaria/otzaria/blob/main/LICENSE"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary font-bold hover:underline"
                    >
                      לחצו כאן
                    </a>
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
                  פנה אלינו בפורום אוצריא
                </a>
              </div>
            </section>
          </div>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}
