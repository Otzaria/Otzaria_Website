'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

export default function InstallationTutorialPage() {
  return (
    <div className="min-h-screen">
      <OtzariaSoftwareHeader />

      <main className="py-12 px-4">
        <div className="container mx-auto max-w-6xl">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-on-surface/60 mb-6">
            <Link href="/" className="hover:text-primary">בית</Link>
            <span>›</span>
            <Link href="/docs" className="hover:text-primary">מדריכים</Link>
            <span>›</span>
            <span className="text-on-surface">מדריך הפעלת תוכנת אוצריא</span>
          </div>

          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12 glass-strong rounded-2xl p-12 border-4 border-primary"
          >
            <span className="material-symbols-outlined text-7xl text-primary mb-4 block">
              install_desktop
            </span>
            <h1 className="text-4xl font-bold text-primary-dark mb-4 font-frank">
              מדריך הפעלת תוכנת אוצריא
            </h1>
            <p className="text-xl text-on-surface/70">
              הוראות מפורטות להתקנה והפעלה של התוכנה במערכת Windows
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-4 gap-8">
            {/* Sidebar TOC */}
            <aside className="lg:col-span-1">
              <div className="glass-strong rounded-xl p-6 sticky top-24">
                <h3 className="text-xl font-bold text-primary-dark mb-4">תוכן עניינים</h3>
                <nav className="space-y-2">
                  {[
                    { href: '#intro', label: 'הקדמה' },
                    { href: '#download', label: 'הורדת התוכנה' },
                    { href: '#installation', label: 'התקנה' },
                    { href: '#library', label: 'הוספת ספרייה' },
                    { href: '#features', label: 'תכונות עיקריות' },
                    { href: '#search', label: 'חיפוש' },
                    { href: '#navigation', label: 'ניווט בין ספרים' },
                    { href: '#settings', label: 'הגדרות' },
                    { href: '#advanced', label: 'אפשרויות מתקדמות' }
                  ].map((item, i) => (
                    <a
                      key={i}
                      href={item.href}
                      className="block p-2 text-sm text-on-surface/70 hover:text-primary hover:bg-surface-variant rounded-lg transition-colors"
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Main Content */}
            <article className="lg:col-span-3 space-y-8">
              {/* Intro Section */}
              <motion.section
                id="intro"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">info</span>
                  הקדמה
                </h2>
                <div className="space-y-4 text-lg">
                  <p>ברוכים הבאים למדריך ההפעלה של תוכנת אוצריא!</p>
                  <p>מדריך זה יעזור לכם להתקין ולהפעיל את התוכנה בצורה נכונה, ולהכיר את התכונות העיקריות שלה.</p>
                </div>
                <div className="mt-6 p-4 bg-blue-50 border-r-4 border-blue-400 rounded">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-blue-600">lightbulb</span>
                    <div>
                      <p className="text-blue-900"><strong>לתשומת לב:</strong> המדריך מיועד למשתמשי Windows. אם אתם משתמשים במערכת הפעלה אחרת, ייתכנו הבדלים בתהליך ההתקנה.</p>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Download Section */}
              <motion.section
                id="download"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">download</span>
                  הורדת התוכנה
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">גרסאות זמינות</h3>
                    <p className="mb-6">ישנן מספר גרסאות של התוכנה. בחרו את הגרסה המתאימה לכם:</p>
                  </div>

                  <div className="space-y-4">
                    {/* גירסאות יציבות */}
                    <div className="p-6 bg-green-50 border-2 border-green-400 rounded-xl">
                      <h4 className="text-2xl font-bold text-green-800 mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined">verified</span>
                        גירסאות יציבות (מומלץ)
                      </h4>
                      <p className="text-green-900 mb-4">גירסאות שנבדקו ויציבות למשתמשים רגילים</p>
                      
                      <div className="space-y-3">
                        <a
                          href="https://github.com/Y-PLONI/otzaria/releases/latest/download/otzaria-windows.exe"
                          className="flex items-center justify-between p-4 bg-white rounded-lg hover:shadow-lg transition-shadow group"
                          download
                        >
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-3xl text-blue-600">desktop_windows</span>
                            <div>
                              <div className="font-bold text-lg">Windows (EXE)</div>
                              <div className="text-sm text-gray-600">מומלץ למשתמשי Windows</div>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-primary group-hover:translate-x-[-4px] transition-transform">download</span>
                        </a>

                        <a
                          href="https://github.com/Y-PLONI/otzaria/releases/latest/download/otzaria-macos.zip"
                          className="flex items-center justify-between p-4 bg-white rounded-lg hover:shadow-lg transition-shadow group"
                          download
                        >
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-3xl text-gray-700">laptop_mac</span>
                            <div>
                              <div className="font-bold text-lg">macOS (ZIP)</div>
                              <div className="text-sm text-gray-600">למחשבי Mac</div>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-primary group-hover:translate-x-[-4px] transition-transform">download</span>
                        </a>

                        <a
                          href="https://github.com/Y-PLONI/otzaria/releases/latest"
                          className="flex items-center justify-between p-4 bg-white rounded-lg hover:shadow-lg transition-shadow group"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-3xl text-orange-600">computer</span>
                            <div>
                              <div className="font-bold text-lg">Linux (DEB)</div>
                              <div className="text-sm text-gray-600">Ubuntu, Debian ומשפחתם</div>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-primary group-hover:translate-x-[-4px] transition-transform">open_in_new</span>
                        </a>

                        <a
                          href="https://github.com/Y-PLONI/otzaria/releases/latest"
                          className="flex items-center justify-between p-4 bg-white rounded-lg hover:shadow-lg transition-shadow group"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-3xl text-red-600">computer</span>
                            <div>
                              <div className="font-bold text-lg">Linux (RPM)</div>
                              <div className="text-sm text-gray-600">Fedora, RedHat ומשפחתם</div>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-primary group-hover:translate-x-[-4px] transition-transform">open_in_new</span>
                        </a>

                        <a
                          href="https://github.com/Y-PLONI/otzaria/releases/latest/download/app-release.apk"
                          className="flex items-center justify-between p-4 bg-white rounded-lg hover:shadow-lg transition-shadow group"
                          download
                        >
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-3xl text-green-600">android</span>
                            <div>
                              <div className="font-bold text-lg">Android (APK)</div>
                              <div className="text-sm text-gray-600">למכשירי אנדרואיד</div>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-primary group-hover:translate-x-[-4px] transition-transform">download</span>
                        </a>
                      </div>
                    </div>

                    {/* גירסאות מפתחים */}
                    <div className="p-6 bg-purple-50 border-2 border-purple-400 rounded-xl">
                      <h4 className="text-2xl font-bold text-purple-800 mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined">code</span>
                        גירסאות מפתחים (Dev)
                      </h4>
                      <p className="text-purple-900 mb-4">גירסאות עם תכונות חדשות שעדיין בבדיקה</p>
                      
                      <a
                        href="https://github.com/Y-PLONI/otzaria/releases?q=prerelease%3Atrue"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-bold"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span className="material-symbols-outlined">open_in_new</span>
                        <span>צפייה בגירסאות מפתחים</span>
                      </a>
                    </div>

                    {/* כל הגירסאות */}
                    <div className="p-4 bg-gray-50 border border-gray-300 rounded-xl">
                      <a
                        href="https://github.com/Y-PLONI/otzaria/releases"
                        className="flex items-center justify-between hover:text-primary transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span className="font-bold">צפייה בכל הגירסאות ב-GitHub</span>
                        <span className="material-symbols-outlined">arrow_outward</span>
                      </a>
                    </div>
                  </div>

                  <div className="p-4 bg-red-50 border-r-4 border-red-400 rounded">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-red-600">warning</span>
                      <div>
                        <p className="text-red-900"><strong>שימו לב:</strong> הורדת הספרייה עשויה לקחת זמן רב בגלל גודלה. וודאו שיש לכם חיבור אינטרנט יציב.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Installation Section */}
              <motion.section
                id="installation"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">settings</span>
                  התקנת התוכנה
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">שיטת התקנה א': קובץ EXE</h3>
                    <div className="space-y-4">
                      {[
                        { num: 1, title: 'הפעלת ההתקנה', desc: 'הפעילו את קובץ ההתקנה שהורדתם (otzaria.exe).' },
                        { num: 2, title: 'בחירת מיקום', desc: 'בחרו את המיקום להתקנת התוכנה. מומלץ: התקינו בכונן C:\\ או בכונן אחר עם מספיק מקום פנוי.' },
                        { num: 3, title: 'השלמת ההתקנה', desc: 'המתינו עד לסיום ההתקנה. התהליך עשוי לקחת מספר דקות.' }
                      ].map((step) => (
                        <div key={step.num} className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                          <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                            {step.num}
                          </div>
                          <div className="flex-1">
                            <h4 className="text-xl font-bold text-primary-dark mb-2">{step.title}</h4>
                            <p>{step.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">שיטת התקנה ב': קובץ MSIX</h3>
                    <p>אם בחרתם בגרסת MSIX, פשוט לחצו פעמיים על הקובץ והתקנה תתבצע אוטומטית.</p>
                  </div>

                  <div className="p-4 bg-orange-50 border-r-4 border-orange-400 rounded">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-orange-600">tips_and_updates</span>
                      <div>
                        <p className="text-orange-900"><strong>טיפ:</strong> אם אתם מתקינים את התוכנה בפעם הראשונה, מומלץ להוריד את הגרסה המלאה עם הספרייה.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Library Section */}
              <motion.section
                id="library"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">library_books</span>
                  הוספת ספרייה לתוכנה
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">שיטה א': הורדה ישירה</h3>
                    <p className="mb-4">אם התקנתם את התוכנה ללא ספרייה, תוכלו להוסיף אותה בשלבים הבאים:</p>
                    <div className="space-y-4">
                      {[
                        { num: 1, title: 'הורדת הספרייה', desc: 'הורידו את קובץ הספרייה מהאתר הרשמי.' },
                        { num: 2, title: 'חילוץ הקבצים', desc: 'חלצו את הקבצים לתיקייה שבחרתם (מומלץ: C:\\otzaria).' },
                        { num: 3, title: 'קישור לתוכנה', desc: 'פתחו את התוכנה והצביעו על מיקום הספרייה בהגדרות.' }
                      ].map((step) => (
                        <div key={step.num} className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                          <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                            {step.num}
                          </div>
                          <div className="flex-1">
                            <h4 className="text-xl font-bold text-primary-dark mb-2">{step.title}</h4>
                            <p>{step.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">שיטה ב': שימוש ב-Symbolic Link</h3>
                    <p className="mb-4">למשתמשים מתקדמים - ניתן ליצור קישור סימבולי:</p>
                    <pre className="bg-gray-800 text-white p-4 rounded overflow-x-auto text-sm">
                      <code>MKLINK /J "C:\otzaria\books" "D:\my-books"</code>
                    </pre>
                    <p className="mt-4">פקודה זו תיצור קישור מהתיקייה C:\otzaria\books לתיקייה D:\my-books.</p>
                  </div>

                  <div className="p-4 bg-red-50 border-r-4 border-red-400 rounded">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-red-600">warning</span>
                      <div>
                        <p className="text-red-900"><strong>חשוב:</strong> וודאו שיש לכם מספיק מקום פנוי בדיסק לפני הורדת הספרייה. הספרייה המלאה עשויה לתפוס כ-5 ג'יגה-בייט, ולאחר האינדוקס האוטומטי - עוד כ-5.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Features, Search, Navigation, Settings, Advanced sections */}
              <motion.section
                id="features"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">star</span>
                  תכונות עיקריות
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">גרסה 0.2.3 - עדכונים חדשים</h3>
                    <ul className="list-disc mr-6 space-y-2">
                      <li><strong>פרוטוקולים מותאמים אישית</strong> - תמיכה בפרוטוקולים מותאמים אישית</li>
                      <li><strong>הוספת PDF</strong> - אפשרות להוסיף קבצי PDF לספרייה</li>
                      <li><strong>שיפורים רבים</strong> - תיקוני באגים ושיפורי ביצועים</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">יכולות חיפוש מתקדמות</h3>
                    <p className="mb-4">התוכנה כוללת מנוע חיפוש מתקדם המאפשר:</p>
                    <ul className="list-disc mr-6 space-y-2">
                      <li>חיפוש מדויק וחיפוש מקורב</li>
                      <li>סינון לפי ספרים וקטגוריות</li>
                      <li>שימוש באופרטורים לוגיים</li>
                      <li>חיפוש עם תווים כלליים</li>
                    </ul>
                  </div>
                </div>
              </motion.section>

              <motion.section
                id="search"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">search</span>
                  שימוש בחיפוש
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">יצירת אינדקס</h3>
                    <p className="mb-4">לפני השימוש הראשון בחיפוש, יש ליצור אינדקס:</p>
                    <div className="space-y-3">
                      {[
                        'לחצו על כפתור "עדכון אינדקס" (מסומן בעיגול)',
                        'אשרו את הפעולה בחלון שיפתח',
                        'המתינו עד לסיום יצירת האינדקס'
                      ].map((step, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <span className="w-6 h-6 bg-primary text-on-primary rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                            {i + 1}
                          </span>
                          <p>{step}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 p-4 bg-blue-50 border-r-4 border-blue-400 rounded">
                      <p className="text-blue-900"><strong>שימו לב:</strong> יש לעדכן את האינדקס גם לאחר הוספת ספרים חדשים לתוכנה.</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">סוגי חיפוש</h3>
                    <p className="mb-4">התוכנה תומכת במספר סוגי חיפוש:</p>
                    <ul className="list-disc mr-6 space-y-2">
                      <li><strong>חיפוש רגיל</strong> - חיפוש מדויק של ביטוי מסוים</li>
                      <li><strong>חיפוש מקורב</strong> - חיפוש גמיש יותר</li>
                      <li><strong>חיפוש מתקדם</strong> - שימוש באופרטורים לוגיים</li>
                    </ul>
                    <p className="mt-4">למידע מפורט על אפשרויות החיפוש, עיינו ב<Link href="/docs/search" className="text-primary hover:underline">מדריך החיפוש המלא</Link>.</p>
                  </div>
                </div>
              </motion.section>

              <motion.section
                id="navigation"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">menu_book</span>
                  ניווט בין ספרים וכרטיסיות
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">מעבר בין כרטיסיות</h3>
                    <p className="mb-4">ניתן לעבור בין כרטיסיות פתוחות באמצעות:</p>
                    <ul className="list-disc mr-6 space-y-2">
                      <li><code className="bg-surface px-2 py-1 rounded">Ctrl + Tab</code> - מעבר לכרטיסייה הבאה</li>
                      <li><code className="bg-surface px-2 py-1 rounded">Ctrl + Shift + Tab</code> - מעבר לכרטיסייה הקודמת</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">פתיחת ספרים</h3>
                    <p className="mb-4">לפתיחת ספר חדש:</p>
                    <ol className="list-decimal mr-6 space-y-2">
                      <li>לחצו על "עץ הספרים" בצד</li>
                      <li>נווטו לספר הרצוי</li>
                      <li>לחצו פעמיים על הספר</li>
                    </ol>
                  </div>
                </div>
              </motion.section>

              <motion.section
                id="settings"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">tune</span>
                  הגדרות התוכנה
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">הגדרות כלליות</h3>
                    <p className="mb-4">ניתן להתאים את התוכנה לצרכים שלכם דרך תפריט ההגדרות:</p>
                    <ul className="list-disc mr-6 space-y-2">
                      <li><strong>מיקום הספרייה</strong> - שינוי מיקום תיקיית הספרים</li>
                      <li><strong>גופנים</strong> - התאמת גודל וסוג הגופן</li>
                      <li><strong>צבעים</strong> - בחירת ערכת צבעים</li>
                      <li><strong>שפה</strong> - בחירת שפת הממשק</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">הגדרות חיפוש</h3>
                    <p className="mb-4">ניתן להגדיר את התנהגות ברירת המחדל של החיפוש:</p>
                    <ul className="list-disc mr-6 space-y-2">
                      <li>סוג חיפוש ברירת מחדל (מדויק/מקורב)</li>
                      <li>מספר תוצאות מקסימלי</li>
                      <li>הדגשת תוצאות</li>
                    </ul>
                  </div>
                </div>
              </motion.section>

              <motion.section
                id="advanced"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">build</span>
                  אפשרויות מתקדמות
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">הוספת ספרים מותאמים אישית</h3>
                    <p className="mb-4">ניתן להוסיף ספרים משלכם בפורמטים הבאים:</p>
                    <ul className="list-disc mr-6 space-y-2 mb-6">
                      <li><strong>WORD</strong> (פורמט DOCX)</li>
                      <li><strong>PDF</strong></li>
                      <li><strong>TXT</strong> (בקידוד UTF-8)</li>
                    </ul>
                    <div className="space-y-4">
                      {[
                        { num: 1, title: 'הכנת הקובץ', desc: 'וודאו שהקובץ בפורמט נתמך' },
                        { num: 2, title: 'העתקה לתיקייה', desc: 'העתיקו את הקובץ לתיקיית הספרים' },
                        { num: 3, title: 'עדכון אינדקס', desc: 'עדכנו את האינדקס כדי שהספר יופיע בחיפוש' }
                      ].map((step) => (
                        <div key={step.num} className="flex gap-4 p-4 bg-surface-variant rounded-lg">
                          <div className="w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold flex-shrink-0">
                            {step.num}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-lg mb-1">{step.title}</h4>
                            <p className="text-sm">{step.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-red-50 border-r-4 border-red-400 rounded">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-red-600">warning</span>
                      <div>
                        <p className="text-red-900"><strong>אזהרה:</strong> עריכת קבצי הספרים עלולה לגרום לבעיות בקישורים שבין הספרים. מומלץ לגבות את הקבצים לפני עריכה.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Success Box */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="p-6 bg-green-50 border-r-4 border-green-400 rounded-xl flex items-start gap-4"
              >
                <span className="material-symbols-outlined text-4xl text-green-600">celebration</span>
                <div>
                  <p className="text-green-900 text-lg"><strong>מזל טוב!</strong> סיימתם את המדריך להפעלת תוכנת אוצריא. כעת אתם מוכנים להתחיל להשתמש בתוכנה!</p>
                </div>
              </motion.div>

              {/* Help Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <div className="flex items-start gap-4">
                  <span className="material-symbols-outlined text-5xl text-primary">help</span>
                  <div className="flex-1">
                    <h4 className="text-2xl font-bold text-primary-dark mb-3">זקוק לעזרה נוספת?</h4>
                    <p className="mb-4">אם נתקלת בבעיה או שיש לך שאלה, בקר בדף השאלות הנפוצות או פנה אלינו דרך GitHub.</p>
                    <Link
                      href="/faq"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors font-bold"
                    >
                      <span className="material-symbols-outlined">arrow_back</span>
                      <span>לשאלות נפוצות</span>
                    </Link>
                  </div>
                </div>
              </motion.div>
            </article>
          </div>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}

