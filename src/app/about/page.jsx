import Header from '@/components/layout/OtzariaSoftwareHeader'
import Image from 'next/image'
import Link from 'next/link'

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-16 px-4 overflow-hidden bg-gradient-to-bl from-primary-container via-background to-secondary-container">
          <div className="container mx-auto max-w-4xl relative z-10">
            <div className="text-center animate-enter-up">
              <div className="mb-6 flex justify-center">
                <Image
                  src="/logo.png"
                  alt="לוגו אוצריא"
                  width={100}
                  height={100}
                  className="drop-shadow-2xl"
                />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4 text-on-background font-frank">
                אודות ספריית אוצריא
              </h1>
              <p className="text-xl text-on-surface/80">
                פלטפורמה משותפת לעריכה ושיתוף של ספרי קודש
              </p>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-4xl">
            <div className="space-y-8 animate-enter-up" style={{ animationDelay: '0.2s' }}>
              {/* Library Stats */}
              <div className="glass p-8 rounded-xl">
                <h2 className="text-3xl font-bold mb-6 text-primary flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">library_books</span>
                  ספריית אוצריא
                </h2>
                <div className="space-y-4 text-lg text-on-surface/80 leading-relaxed">
                  <p>
                    <strong className="text-primary">נכון לתאריך ר"ח ניסן תשפ"ו</strong> הספרייה כוללת כ-<strong className="text-accent">7,000 ספרים</strong> הכוללים את רוב ספרי היסוד:
                  </p>
                  <ul className="space-y-3 mr-6">
                    <li className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-accent mt-1">menu_book</span>
                      <span>תנ"ך ומפרשיו</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-accent mt-1">menu_book</span>
                      <span>משנה ומפרשיה</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-accent mt-1">menu_book</span>
                      <span>תלמודים בבלי וירושלמי עם ראשונים ואחרונים</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-accent mt-1">menu_book</span>
                      <span>ספרי הלכה כולל טושו"ע וכל נושאי הכלים</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-accent mt-1">menu_book</span>
                      <span>ספרי מחשבה ומוסר</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-accent mt-1">menu_book</span>
                      <span>ספרי קבלה</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Sources */}
              <div className="glass p-8 rounded-xl">
                <h2 className="text-3xl font-bold mb-6 text-primary flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">source</span>
                  מקורות הספרים
                </h2>
                <div className="space-y-6">
                  <div className="bg-gradient-to-l from-primary/10 to-accent/10 p-5 rounded-lg border border-primary/30">
                    <h3 className="font-bold text-xl text-primary mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined">public</span>
                      ספריא (Sefaria)
                    </h3>
                    <p className="text-on-surface/80">
                      מארה"ב - הספרים ממאגר זה עברו סינון קפדני להסרת ספרים שאינם מתאימים לציבור התורני.
                    </p>
                  </div>

                  <div className="bg-gradient-to-l from-accent/10 to-primary/10 p-5 rounded-lg border border-accent/30">
                    <h3 className="font-bold text-xl text-accent mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined">edit_document</span>
                      דיקטה
                    </h3>
                    <p className="text-on-surface/80">
                      מקור משמעותי נוסף - ספרים אלו עברו עריכה עבור התאמתם ל"אוצריא".
                    </p>
                  </div>

                  <div className="bg-surface/50 p-5 rounded-lg">
                    <h3 className="font-bold text-xl text-on-surface mb-3">מקורות נוספים:</h3>
                    <ul className="space-y-2 text-on-surface/80">
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                        <a
                          href="https://oraita.net/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          אורייתא
                        </a>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                        <a
                          href="http://mobile.tora.ws/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          ובלכתך בדרך
                        </a>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                        <a
                          href="https://www.toratemetfreeware.com/online/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          תורת אמת
                        </a>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                        <a
                          href="https://wiki.jewishbooks.org.il/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          אוצר הספרים היהודי השיתופי
                        </a>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                        <a
                          href="https://pninim.org/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          פנינים
                        </a>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-gradient-to-l from-primary/10 to-accent/10 p-5 rounded-lg border border-primary/30">
                    <h3 className="font-bold text-xl text-primary mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined">auto_awesome</span>
                      פרויקט OCR + AI
                    </h3>
                    <p className="text-on-surface/80">
                      המרה של ספרים מצולמים מאתר <strong>HebrewBooks</strong> באמצעות כלי OCR ושימוש במודלים מתקדמים של AI.
                    </p>
                  </div>
                </div>
              </div>

              {/* Terms of Use */}
              <div className="glass p-8 rounded-xl">
                <h2 className="text-3xl font-bold mb-6 text-primary flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">gavel</span>
                  תנאי השימוש במאגר
                </h2>

                <div className="space-y-6 text-lg text-on-surface/80 leading-relaxed">
                  <p>
                    הטקסטים ניתנים לשימוש חופשי, עם זאת <strong className="text-accent">חלק מהטקסטים ניתנים ברישיון שאינו מאפשר שימוש מסחרי</strong>.
                  </p>

                  <div className="flex flex-col gap-4 border-r-2 border-primary/20 pr-4 mt-4">
                    <div className="flex items-center gap-2 text-primary">
                      <span className="material-symbols-outlined">info</span>
                      <span>ניתן לראות את פרטי הרישיון לכל טקסט באתר ספריא</span>
                    </div>

                    <Link href="/license" className="flex items-center gap-2 text-primary hover:underline font-medium w-fit">
                      <span className="material-symbols-outlined">description</span>
                      לרישיון הכללי של מאגר אוצריא
                    </Link>

                    <Link href="/library/license" className="flex items-center gap-2 text-primary hover:underline font-medium w-fit">
                      <span className="material-symbols-outlined">auto_stories</span>
                      לרישיון הספרים הערוכים בספריית אוצריא
                    </Link>
                  </div>
                </div>
              </div>

              {/* Community */}
              <div className="glass p-8 rounded-xl">
                <h2 className="text-3xl font-bold mb-4 text-primary flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">groups</span>
                  קהילת עורכי אוצריא
                </h2>
                <p className="text-lg text-on-surface/80 leading-relaxed mb-6">
                  לצורך עדכון והרחבת מאגר ספריית אוצריא עובדים מתנדבים רבים מכל העולם. הצטרפו אליהם והיו שותפים בשימור והנגשת המורשת התורנית!
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href="/library/users" className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors">
                    <span className="material-symbols-outlined">people</span>
                    <span>צפה במשתמשים</span>
                  </Link>
                  <Link href="/library/auth/login" className="flex items-center justify-center gap-2 px-6 py-3 bg-surface text-on-surface rounded-lg hover:bg-surface-variant transition-colors border border-outline">
                    <span className="material-symbols-outlined">add</span>
                    <span>התחבר לקהילה</span>
                  </Link>
                </div>
              </div>

              {/* Quote */}
              <div
                className="glass-strong p-8 rounded-xl text-center border-r-4 border-primary animate-enter-scale"
               style={{ animationDelay: '0.4s' }}>
                <p className="text-2xl font-bold text-primary mb-4 font-frank">
                  "צדקתו עומדת לעד"
                </p>
                <p className="text-lg text-on-surface/80">
                  זה הכותב או קונה ספרים ומשאילן לאחרים
                </p>
                <p className="text-sm text-on-surface/60 mt-2">
                  (כתובות נ')
                </p>
              </div>

              {/* CTA */}
              <div className="text-center pt-8">
                <h3 className="text-2xl font-bold mb-4 text-on-surface">
                  מוכנים להצטרף אלינו?
                </h3>
                <Link href="/library" className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-on-primary rounded-lg text-lg font-medium hover:bg-accent transition-colors shadow-lg hover:shadow-xl">
                  <span className="material-symbols-outlined">library_books</span>
                  <span>התחל לערוך</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

