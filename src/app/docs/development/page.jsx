import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

export default function DevelopmentTutorialPage() {
  const tocItems = [
    { href: '#intro', label: 'הקדמה' },
    { href: '#requirements', label: 'דרישות מערכת' },
    { href: '#git-install', label: 'התקנת Git' },
    { href: '#flutter-install', label: 'התקנת Flutter' },
    { href: '#editor-install', label: 'התקנת עורך קוד' },
    { href: '#fork', label: 'יצירת Fork' },
    { href: '#clone', label: 'הורדת המאגר' },
    { href: '#editing', label: 'עריכת הקוד' },
    { href: '#testing', label: 'בדיקה ובנייה' }
  ]

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
            <span className="text-on-surface">מדריך פיתוח</span>
          </div>

          {/* Hero */}
          <div className="text-center mb-12 glass-strong rounded-2xl p-12 border-4 border-primary animate-enter-up">
            <span className="material-symbols-outlined text-7xl text-primary mb-4 block">
              code
            </span>
            <h1 className="text-4xl font-bold text-primary-dark mb-4 font-frank">
              רוצה לערוך את תוכנת אוצריא?
            </h1>
            <p className="text-xl text-on-surface/70">
              עכשיו זה אפשרי! גם ללא ידע מעמיק בתכנות
            </p>
          </div>

          <div className="grid lg:grid-cols-4 gap-8">
            {/* Sidebar TOC */}
            <aside className="lg:col-span-1">
              <div className="glass-strong rounded-xl p-6 sticky top-24 custom-scrollbar max-h-[calc(100vh-120px)] overflow-y-auto">
                <h3 className="text-xl font-bold text-primary-dark mb-4">תוכן עניינים</h3>
                <nav className="space-y-2">
                  {tocItems.map((item, i) => (
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
              <section
                id="intro"
                className="glass-strong rounded-xl p-8 animate-enter-up"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">rocket_launch</span>
                  הקדמה
                </h2>
                <div className="space-y-4 text-lg">
                  <p><strong>גם אתה רוצה להוסיף שיפורים לאוצריא?</strong> אבל אין לך כח לחכות עד שזה יתווסף, אם בכלל...</p>
                  <p><strong>אז תקשיב למשפט הבא:</strong> אתה בעצמך תעשה את זה, בצורה שתרצה ובאופן שהכי מוצא חן בעיניך!!</p>
                  <p>נשמע לך לא אפשרי? אתה טועה! תיכף תראה כמה זה אפשרי!</p>
                  <p>תוכל לעשות הכל באמצעות בקשה פשוטה בשפה שלך לסוכן AI שיעשה כל מה שרק תבקש ממנו!!</p>
                </div>
                <div className="mt-6 p-4 bg-warning-strong-50 border-r-4 border-warning-strong-400 rounded">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-warning-strong-600">tips_and_updates</span>
                    <div>
                      <p className="text-warning-strong-900"><strong>טיפ חשוב:</strong> תתחילו מדברים קטנים ממש ממש, לאט לאט מתקדמים בחיים, לא קופצים מידי גבוה על ההתחלה.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Requirements Section */}
              <section
                id="requirements"
                className="glass-strong rounded-xl p-8 animate-enter-up"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">checklist</span>
                  דרישות מערכת
                </h2>
                <div className="space-y-4">
                  <p className="text-lg">לפני שמתחילים, וודאו שיש לכם:</p>
                  <ul className="list-disc mr-6 space-y-3 text-lg">
                    <li><strong>פרופיל בגיטהאב</strong> - אם אין לכם, צרו אחד ב-<a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub.com</a></li>
                    <li><strong>Windows 10 או 11</strong> של 64 סיביות</li>
                    <li><strong>לפחות 8 ג'יגה RAM</strong> (עדיף 16)</li>
                    <li><strong>בין 15 ל-20 ג"ב פנויים</strong> במחשב</li>
                    <li><strong>רשת יציבה</strong> - בדר"כ גלישה באמצעות סטיק לא תספיק</li>
                  </ul>
                  <div className="mt-6 p-4 bg-info-50 border-r-4 border-info-400 rounded">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-info-600">info</span>
                      <div>
                        <p className="text-info-900">ההדרכה מתאימה למי שעובד דרך Windows.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Git Installation */}
              <section
                id="git-install"
                className="glass-strong rounded-xl p-8 animate-enter-up"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">download</span>
                  התקנת Git
                </h2>
                <p className="text-lg mb-6">תחילה, יש להתקין Git, מערכת בקרת הגרסאות שתאפשר לנו לנהל את קוד הפרויקט.</p>
                <div className="space-y-4">
                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">הורדה והתקנה</h4>
                      <p>למשתמשי Windows, התקינו את <a href="https://git-scm.com/download/win" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Git for Windows</a></p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">בדיקת ההתקנה</h4>
                      <p className="mb-3">פתחו את ה-CMD והריצו את הפקודה:</p>
                      <pre className="bg-neutral-800 text-white p-4 rounded overflow-x-auto text-sm">
                        <code>git --version</code>
                      </pre>
                      <p className="mt-3">אם לא מופיע מספר גירסה, זה אומר שצריך להכניס את נתיב ההתקנה למשתני הסביבה של PATH.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Flutter Installation */}
              <section
                id="flutter-install"
                className="glass-strong rounded-xl p-8 animate-enter-up"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">flutter</span>
                  התקנת Flutter
                </h2>
                <p className="text-lg mb-6">Flutter הוא הפריימוורק שבו נבנתה אוצריא. יש להתקין אותו כדי לפתח את התוכנה.</p>
                <div className="space-y-4">
                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">הורדת Visual Studio</h4>
                      <p>הורידו והתקינו את <a href="https://visualstudio.microsoft.com/downloads/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Visual Studio Community</a> (גרסה חינמית)</p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">הורדת Flutter SDK</h4>
                      <p>הורידו את <a href="https://docs.flutter.dev/get-started/install/windows" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Flutter SDK</a> וחלצו אותו לתיקייה (למשל: C:\flutter)</p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">הוספה ל-PATH</h4>
                      <p>הוסיפו את התיקייה C:\flutter\bin למשתני הסביבה PATH</p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      4
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">בדיקת ההתקנה</h4>
                      <p className="mb-3">הריצו בטרמינל:</p>
                      <pre className="bg-neutral-800 text-white p-4 rounded overflow-x-auto text-sm">
                        <code>flutter doctor</code>
                      </pre>
                      <p className="mt-3">הפקודה תבדוק מה חסר ותציג הוראות להשלמת ההתקנה.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Editor Installation */}
              <section
                id="editor-install"
                className="glass-strong rounded-xl p-8 animate-enter-up"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">edit_note</span>
                  התקנת עורך קוד
                </h2>
                <p className="text-lg mb-6">מומלץ להשתמש ב-VS Code עם תוסף Flutter.</p>
                <div className="space-y-4">
                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">הורדת VS Code</h4>
                      <p>הורידו והתקינו את <a href="https://code.visualstudio.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Visual Studio Code</a></p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">התקנת תוסף Flutter</h4>
                      <p>פתחו את VS Code, לחצו על Extensions (Ctrl+Shift+X) וחפשו "Flutter". התקינו את התוסף הרשמי.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Fork Section */}
              <section
                id="fork"
                className="glass-strong rounded-xl p-8 animate-enter-up"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">fork_right</span>
                  יצירת Fork
                </h2>
                <p className="text-lg mb-6">Fork הוא עותק של הפרויקט שלך ב-GitHub, שם תוכל לעשות שינויים.</p>
                <div className="space-y-4">
                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">גשו למאגר</h4>
                      <p>היכנסו ל-<a href="https://github.com/otzaria/otzaria" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">מאגר אוצריא ב-GitHub</a></p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">לחצו על Fork</h4>
                      <p>לחצו על כפתור "Fork" בפינה הימנית העליונה. זה ייצור עותק של הפרויקט בחשבון שלכם.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Clone Section */}
              <section
                id="clone"
                className="glass-strong rounded-xl p-8 animate-enter-up"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">cloud_download</span>
                  הורדת המאגר
                </h2>
                <p className="text-lg mb-6">עכשיו נוריד את הקוד למחשב שלכם.</p>
                <div className="space-y-4">
                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">העתקת הקישור</h4>
                      <p>במאגר שלכם ב-GitHub, לחצו על "Code" והעתיקו את ה-URL</p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">Clone המאגר</h4>
                      <p className="mb-3">פתחו טרמינל והריצו:</p>
                      <pre className="bg-neutral-800 text-white p-4 rounded overflow-x-auto text-sm">
                        <code>git clone [URL שהעתקתם]</code>
                      </pre>
                    </div>
                  </div>

                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">פתיחה ב-VS Code</h4>
                      <p>פתחו את התיקייה שהורדה ב-VS Code</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Editing Section */}
              <section
                id="editing"
                className="glass-strong rounded-xl p-8 animate-enter-up"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">edit</span>
                  עריכת הקוד
                </h2>
                <div className="space-y-6">
                  <p className="text-lg">עכשיו אתם יכולים לערוך את הקוד! כמה טיפים:</p>
                  <ul className="list-disc mr-6 space-y-3 text-lg">
                    <li>השתמשו ב-AI (כמו ChatGPT, Claude, או Copilot) כדי לעזור לכם לכתוב קוד</li>
                    <li>התחילו משינויים קטנים - שינוי טקסט, צבעים, וכו'</li>
                    <li>קראו את הקוד הקיים כדי להבין איך הוא עובד</li>
                    <li>אל תפחדו לנסות - תמיד אפשר לחזור אחורה!</li>
                  </ul>
                  <div className="p-4 bg-warning-strong-50 border-r-4 border-warning-strong-400 rounded">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-warning-strong-600">tips_and_updates</span>
                      <div>
                        <p className="text-warning-strong-900"><strong>טיפ:</strong> השתמשו ב-Ctrl+F כדי לחפש טקסט בקוד. זה יעזור לכם למצוא איפה לעשות שינויים.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Testing Section */}
              <section
                id="testing"
                className="glass-strong rounded-xl p-8 animate-enter-up"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">bug_report</span>
                  בדיקה ובנייה
                </h2>
                <div className="space-y-4">
                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">הרצת הפרויקט</h4>
                      <p className="mb-3">בטרמינל, הריצו:</p>
                      <pre className="bg-neutral-800 text-white p-4 rounded overflow-x-auto text-sm">
                        <code>flutter run</code>
                      </pre>
                      <p className="mt-3">זה יריץ את התוכנה במצב פיתוח ותוכלו לראות את השינויים שלכם.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">בניית הפרויקט</h4>
                      <p className="mb-3">כשאתם מרוצים מהשינויים, בנו את הפרויקט:</p>
                      <pre className="bg-neutral-800 text-white p-4 rounded overflow-x-auto text-sm">
                        <code>flutter build windows</code>
                      </pre>
                    </div>
                  </div>

                  <div className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                    <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-primary-dark mb-2">שיתוף השינויים</h4>
                      <p>אם אתם רוצים לשתף את השינויים עם הקהילה, צרו Pull Request ב-GitHub.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Success Box */}
              <div className="p-6 bg-success-50 border-r-4 border-success-400 rounded-xl flex items-start gap-4 animate-enter-up">
                <span className="material-symbols-outlined text-4xl text-success-600">celebration</span>
                <div>
                  <p className="text-success-900 text-lg"><strong>כל הכבוד!</strong> עכשיו אתם מפתחים של אוצריא! המשיכו ללמוד ולשפר את התוכנה.</p>
                </div>
              </div>

              {/* Help Card */}
              <div className="glass-strong rounded-xl p-8 animate-enter-up">
                <div className="flex items-start gap-4">
                  <span className="material-symbols-outlined text-5xl text-primary">help</span>
                  <div className="flex-1">
                    <h4 className="text-2xl font-bold text-primary-dark mb-3">זקוק לעזרה?</h4>
                    <p className="mb-4">הצטרפו לקהילה ב-GitHub או שאלו שאלות בפורומים.</p>
                    <a
                      href="https://github.com/otzaria/otzaria"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors font-bold"
                    >
                      <span className="material-symbols-outlined">open_in_new</span>
                      <span>למאגר ב-GitHub</span>
                    </a>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}

