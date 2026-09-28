import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import OfflineUpdateDownload from '@/components/offline/OfflineUpdateDownload'

export const metadata = {
  title: 'עדכוני אוצריא - עדכון לא-מקוון | אוצריא',
  description:
    'כלי "עדכוני אוצריא": עדכון התוכנה, ספריית הספרים והתוספים במחשב שאינו מחובר לאינטרנט, באמצעות כונן USB.'
}

const REPO_URL = 'https://github.com/Otzaria/Otzaria_Offline_update'

const modules = [
  {
    icon: 'system_update_alt',
    title: 'תוכנת אוצריא',
    description: 'זיהוי ההתקנה הקיימת, בדיקת גרסה, התקנה ועדכון של התוכנה עצמה, כולל "מה התחדש" בכל גרסה.'
  },
  {
    icon: 'library_books',
    title: 'ספריית הספרים',
    description: 'עדכון מסד הספרים בעזרת קובצי הפרשים קטנים במקום הורדה מלאה, עם אימות שלמות לפני ההחלפה.'
  },
  {
    icon: 'extension',
    title: 'תוספים',
    description: 'חנות תוספים לא-מקוונת: הקטלוג מסונכרן מהאתר לכונן, וההתקנה נעשית ישירות לתוך אוצריא.'
  }
]

const steps = [
  {
    icon: 'download',
    title: 'מורידים במחשב המקוון',
    description:
      'מתקינים את "עדכוני אוצריא" על כונן USB ומריצים אותו במחשב שיש בו אינטרנט. הכלי מוריד לכונן את העדכונים הזמינים: התוכנה, הספרייה והתוספים.'
  },
  {
    icon: 'usb',
    title: 'מעבירים את הכונן',
    description:
      'מחברים את הכונן למחשב הלא-מקוון ומריצים ממנו את הכלי. הוא מזהה את אוצריא, את הספרייה ואת התוספים המותקנים, ומראה מה מחכה לעדכון.'
  },
  {
    icon: 'task_alt',
    title: 'מעדכנים בלחיצה',
    description:
      'בוחרים מה לעדכן ומאשרים. ההחלה נעשית מתוך הכונן, בלי פנייה לרשת, עם גיבוי של המסד הקיים ואפשרות התאוששות.'
  }
]

const highlights = [
  { icon: 'lock', text: 'שום הורדה או התקנה לא מתחילה בלי אישור מפורש של המשתמש' },
  { icon: 'verified', text: 'כל קובץ עדכון מאומת לפני ההחלה, וההחלפה של המסד היא אטומית' },
  { icon: 'devices', text: 'עובד גם במחשב מקוון: בדיקת עדכונים, הורדה והתקנה באותו מקום' },
  { icon: 'group', text: 'הורדה אחת משמשת לעדכון של כמה מחשבים לא-מקוונים' },
  { icon: 'translate', text: 'ממשק בעברית ובאנגלית, בעיצוב זהה לאוצריא' },
  { icon: 'code', text: 'קוד פתוח, כמו אוצריא עצמה' }
]

export default function OfflineUpdatePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <OtzariaSoftwareHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative py-16 px-4 overflow-hidden bg-gradient-to-bl from-primary-container via-background to-secondary-container">
          {/* בלי אנימציית כניסה: טקסט ה-hero הוא אלמנט ה-LCP, והאנימציה דחתה אותו
              בכ-0.6 שניות אחרי הציור הראשון */}
          <div className="container mx-auto max-w-4xl relative z-10 text-center">
            <div className="mb-6 flex justify-center">
              <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center shadow-lg">
                <span className="material-symbols-outlined text-6xl text-primary">cloud_off</span>
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-on-background font-frank">
              עדכוני אוצריא
            </h1>
            <p className="text-xl md:text-2xl text-on-surface/80 mb-4">
              עדכון התוכנה, הספרייה והתוספים במחשב שאינו מחובר לאינטרנט
            </p>
            <p className="text-base md:text-lg text-on-surface/70 leading-relaxed max-w-3xl mx-auto">
              רבים מהמשתמשים לומדים באוצריא על מחשב מנותק מהרשת. &quot;עדכוני אוצריא&quot; הוא כלי
              קטן ונפרד שמורידים במחשב מקוון על כונן USB, מעבירים למחשב הלומד, ומעדכנים בו את
              אוצריא, את ספריית הספרים ואת התוספים, בלי חיבור לאינטרנט.
            </p>
          </div>
        </section>

        {/* Download */}
        <section id="download" className="py-12 px-4">
          <div className="container mx-auto max-w-4xl">
            <OfflineUpdateDownload repoUrl={REPO_URL} />
          </div>
        </section>

        {/* How it works */}
        <section className="py-16 px-4 bg-surface">
          <div className="container mx-auto max-w-5xl">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 font-frank">איך זה עובד?</h2>
            <p className="text-center text-on-surface/70 mb-12 max-w-2xl mx-auto">
              שלושה שלבים, בלי הגדרות מסובכות
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {steps.map((step, index) => (
                <div
                  key={step.title}
                  className="glass p-6 rounded-xl shadow-lg animate-enter-up relative"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold flex-shrink-0">
                      {index + 1}
                    </span>
                    <span className="material-symbols-outlined text-4xl text-primary">{step.icon}</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-on-surface">{step.title}</h3>
                  <p className="text-on-surface/70 leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What it updates */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-5xl">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 font-frank">מה הכלי מעדכן?</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {modules.map((module, index) => (
                <div
                  key={module.title}
                  className="p-6 bg-white border border-neutral-200 rounded-xl hover:border-primary hover:shadow-lg transition-all animate-enter-up"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <span className="material-symbols-outlined text-5xl text-primary mb-4 block">{module.icon}</span>
                  <h3 className="text-xl font-bold mb-2">{module.title}</h3>
                  <p className="text-neutral-600 leading-relaxed">{module.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Highlights */}
        <section className="py-16 px-4 bg-primary/5">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-3xl font-bold text-center mb-10 font-frank">טוב לדעת</h2>
            <ul className="grid sm:grid-cols-2 gap-4">
              {highlights.map((item) => (
                <li key={item.text} className="flex items-start gap-3 bg-white/70 rounded-xl p-4 border border-neutral-200">
                  <span className="material-symbols-outlined text-primary mt-0.5">{item.icon}</span>
                  <span className="text-on-surface/80 leading-relaxed">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Requirements & source */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-4xl">
            <div className="glass-strong rounded-2xl p-8 border border-surface-variant">
              <h2 className="text-2xl font-bold mb-6 text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">info</span>
                דרישות והערות
              </h2>
              <ul className="list-disc mr-6 space-y-3 text-on-surface/80 leading-relaxed">
                <li>
                  <strong>מערכות נתמכות:</strong> Windows 10 ומעלה, ו-macOS 10.15 ומעלה. הכלי מיועד למחשבים
                  שולחניים בלבד. במכשירי Android ו-iOS העדכון נעשה דרך חנות האפליקציות.
                </li>
                <li>
                  <strong>איפה להתקין:</strong> מומלץ להתקין ישירות על כונן USB. הכלי שומר את העדכונים
                  שהוריד בתיקייה שלצידו, כך שאותו כונן משמש גם להורדה וגם להחלה.
                </li>
                <li>
                  <strong>אוצריא סגורה:</strong> בזמן החלת עדכון לתוכנה או לספרייה אוצריא צריכה להיות
                  סגורה. הכלי מזהה אם היא פתוחה ומתריע לפני הפעולה.
                </li>
                <li>
                  <strong>מקום פנוי:</strong> מסד הספרים המלא שוקל כמה ג&apos;יגה-בייט. עדכון חודשי רגיל
                  דורש בדרך כלל עשרות מגה-בייט בלבד, אך הכלי עשוי לבחור בהורדת מסד מלא כשזה מהיר יותר.
                </li>
              </ul>
              <div className="mt-8 pt-6 border-t border-neutral-200 flex flex-col sm:flex-row gap-3">
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white border border-primary text-primary rounded-lg font-medium hover:bg-primary/5 transition-colors"
                >
                  <span className="material-symbols-outlined">code</span>
                  קוד המקור ב-GitHub
                </a>
                <a
                  href={`${REPO_URL}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white border border-neutral-300 text-on-surface rounded-lg font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined">bug_report</span>
                  דיווח על תקלה
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}
