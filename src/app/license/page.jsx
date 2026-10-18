import LegalPage, { ForumContact, LegalHeading } from '@/components/legal/LegalPage'

// אותה נקודת קצה וחלון רענון (פעם בשעה) כמו ב-/api/license, אך נטענת ישירות
// בצד השרת כדי למנוע מסך טעינה ו-JavaScript מיותר בצד הלקוח.
// ענף dev ולא main — בכוונה: הרישיון החדש (Personal Use License 1.0, שהדף מתאר) קיים
// כרגע רק ב-dev, וב-main של otzaria עדיין יש GPL. לחזור ל-main (כאן, בקישורים למטה
// וב-/api/license) אחרי שהרישיון ימוזג ל-main.
async function fetchLicenseText() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/Otzaria/otzaria/dev/LICENSE', {
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
    <LegalPage title="רישיון שימוש - אוצריא (Otzaria)">
      <div>
        <LegalHeading>מבוא</LegalHeading>
        <p>
          פרויקט "אוצריא" הוא מיזם שמטרתו הנגשת ספרי קודש לציבור.
          התוכנה מופצת תחת <strong>Personal Use License 1.0</strong> — רישיון שימוש אישי בלבד.
          הספרייה (הספרים והתכנים) מופצת תחת רישיון נפרד — <a href="/library/license" className="text-primary hover:underline">לפרטים לחצו כאן</a>.
        </p>
      </div>

      <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
        <LegalHeading icon="gavel">תנאי הרישיון (License)</LegalHeading>


        <div className="p-4 rounded-xl border border-surface-variant/50 mb-6 dir-ltr text-left font-sans text-sm text-on-surface/90">
          {error ? (
            <div className="text-danger-500 text-center py-4">
              <p>לא ניתן היה לטעון את הרישיון.</p>
              <a
                href="https://github.com/Otzaria/otzaria/blob/dev/LICENSE"
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
              href="https://github.com/Otzaria/otzaria/blob/dev/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-bold hover:underline"
            >
              לחצו כאן
            </a>
          </p>
        </div>
      </div>

      <ForumContact question="יש לך שאלות נוספות בנוגע לרישיון?" />
    </LegalPage>
  )
}
