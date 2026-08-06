import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <OtzariaSoftwareHeader />

      <main className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="glass-strong rounded-3xl p-8 md:p-12 shadow-xl border border-surface-variant animate-enter-up">
            <h1 className="text-4xl font-bold text-primary mb-8 font-frank border-b pb-4">
              מדיניות פרטיות - אוצריא (Otzaria)
            </h1>

            <section className="space-y-10 text-on-surface/80 leading-relaxed">
              {/* מבוא */}
              <div>
                <h2 className="text-2xl font-bold text-on-surface mb-4">מבוא</h2>
                <p>
                  פרויקט "אוצריא" הוא מיזם ללא כוונת רווח שמטרתו הנגשת ספרי קודש לציבור. 
                  אנו מכבדים את פרטיות המשתמשים שלנו, בין אם הם גולשים באתר ובין אם הם משתמשים בתוכנה להורדה.
                </p>
              </div>

              {/* מדיניות האתר */}
              <div>
                <h2 className="text-2xl font-bold text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">public</span>
                  מדיניות פרטיות לאתר (ספריית אוצריא)
                </h2>
                <ul className="list-disc mr-6 space-y-3">
                  <li><strong>מידע אישי:</strong> בעת הרשמה לאתר, אנו אוספים כתובת אימייל ושם משתמש לצורך ניהול חשבון העורך שלך.</li>
                  <li><strong>תזכורות במייל:</strong> אם אישרת זאת, המערכת תשלח לך תזכורות בנוגע לעמודים שתפסת לעריכה וטרם הושלמו. ניתן לבטל אישור זה בכל עת בהגדרות החשבון.</li>
                  <li><strong>רשימת תפוצה:</strong> במידה ונרשמת לעדכונים על ספרים חדשים, כתובת המייל שלך תשמר ברשימת התפוצה שלנו. ניתן להסיר את עצמך בלחיצה אחת מכל מייל שמתקבל.</li>
                  <li><strong>עוגיות (Cookies):</strong> האתר משתמש בעוגיות לצורך שמירת התחברות המשתמש (Session) בלבד.</li>
                </ul>
              </div>

              {/* מדיניות התוכנה - כולל גוגל קלנדר */}
              <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
                <h2 className="text-2xl font-bold text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">desktop_windows</span>
                  מדיניות פרטיות לתוכנת אוצריא (Desktop / Mobile)
                </h2>
                <p className="mb-4">
                  תוכנת אוצריא תוכננה לעבוד באופן מקומי ככל הניתן כדי לשמור על פרטיות מירבית:
                </p>
                
                <div className="bg-white p-6 rounded-xl border border-surface-variant space-y-4 mb-6">
                  <h3 className="font-bold text-primary flex items-center gap-2">
                    <span className="material-symbols-outlined">calendar_month</span>
                    Google Calendar Integration
                  </h3>
                  <div className="dir-ltr text-left font-sans text-sm space-y-2 text-neutral-700">
                    <p>This application uses Google Calendar only to create and manage events explicitly requested by the user.</p>
                    <p>No data is stored on external servers. All access is performed locally on the user's device.</p>
                    <p>User data is not shared with third parties.</p>
                  </div>
                  <div className="border-t pt-4 mt-4">
                    <p className="font-bold text-sm mb-1">ובתרגום לעברית:</p>
                    <p className="text-sm italic">
                      "התוכנה משתמשת ביומן גוגל (Google Calendar) אך ורק לצורך יצירה וניהול של אירועים לבקשת המשתמש המפורשת. 
                      שום מידע אינו נשמר בשרתים חיצוניים. כל הגישה מתבצעת באופן מקומי על מכשיר המשתמש. 
                      מידע המשתמש אינו משותף עם צדדים שלישיים."
                    </p>
                  </div>
                </div>

                <ul className="list-disc mr-6 space-y-3">
                  <li><strong>שמירת נתונים:</strong> כל ההגדרות, הסימניות והיסטוריית הלמידה בתוכנה נשמרים מקומית על המחשב או הטלפון שלך בלבד.</li>
                  <li><strong>גישה לקבצים:</strong> התוכנה מבקשת גישה לתיקיית הספרים כדי לאפשר קריאה וחיפוש. אין לתוכנה גישה לקבצים אישיים אחרים.</li>
                </ul>
              </div>

              {/* אבטחה וצדדים שלישיים */}
              <div>
                <h2 className="text-2xl font-bold text-on-surface mb-4">צדדים שלישיים</h2>
                <p>
                  אנו לא מוכרים, סוחרים או מעבירים לאף גורם חיצוני את המידע המזהה שלך. 
                  אנו משתמשים בשירותי דואר אלקטרוני (SMTP) אמינים אך ורק לצורך שליחת הודעות מערכת ואימות חשבון.
                </p>
              </div>

              {/* יצירת קשר */}
              <div className="pt-8 border-t border-surface-variant text-center">
                <p className="mb-4">יש לך שאלות בנוגע למדיניות הפרטיות?</p>
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
