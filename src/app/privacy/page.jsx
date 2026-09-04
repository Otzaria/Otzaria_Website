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
                <p className="mt-3">
                  אוצריא היא תוכנה חופשית ובקוד פתוח לקריאה וללימוד ספרי קודש, לשולחן העבודה
                  ולנייד. התוכנה עובדת מקומית על המכשיר, ואין לפרויקט שרת שאוסף את תוכן הלמידה,
                  ההערות או היומן של המשתמש.
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
                
                <div className="bg-white p-6 rounded-xl border border-surface-variant space-y-6 mb-6">
                  <h3 className="font-bold text-primary flex items-center gap-2">
                    <span className="material-symbols-outlined">calendar_month</span>
                    חיבור ליומן Google / Google Calendar integration
                  </h3>

                  <div className="space-y-3 text-sm">
                    <p>
                      החיבור ליומן Google הוא אופציונלי לחלוטין. הוא מופעל רק אם המשתמש בחר בעצמו
                      להתחבר לחשבונו במסך ההגדרות של לוח השנה, וניתן לנתק אותו בכל עת.
                    </p>
                    <p className="font-bold">אילו נתונים אנו ניגשים אליהם, ולמה:</p>
                    <ul className="list-disc mr-6 space-y-2">
                      <li>
                        <strong>רשימת היומנים שלך</strong> (ההרשאה{' '}
                        <span dir="ltr">calendar.calendarlist.readonly</span>) — כדי להציג לך את
                        היומנים שלך ולתת לך לבחור אילו מהם יוצגו, וכדי לקרוא את צבע כל יומן לצורך
                        התאמת הצבעים בתצוגה.
                      </li>
                      <li>
                        <strong>קריאת אירועים</strong> (ההרשאה <span dir="ltr">calendar.events</span>)
                        — אנו קוראים אירועים מהיומנים שבחרת, אך ורק לטווח החודשים שמוצג על המסך,
                        ומציגים אותם בתצוגת לוח השנה של התוכנה לצד התאריכים העבריים.
                      </li>
                      <li>
                        <strong>כתיבת אירועים</strong> (אותה הרשאה) — כאשר אתה יוצר, עורך או מוחק
                        אירוע בתוך אוצריא, אנו כותבים את אותו שינוי ליומן הראשי שלך ב-Google, כדי
                        ששני הצדדים יישארו מסונכרנים. אנו לא יוצרים, משנים או מוחקים אירועים
                        שלא ביקשת.
                      </li>
                    </ul>
                    <p className="font-bold">שמירה, שיתוף ומחיקה:</p>
                    <ul className="list-disc mr-6 space-y-2">
                      <li>
                        אין לפרויקט אוצריא שרת שמקבל את נתוני היומן שלך. כל הגישה נעשית ישירות
                        מהמכשיר שלך אל Google.
                      </li>
                      <li>
                        אסימון ההרשאה (Token) והאירועים שנטענו נשמרים מקומית על המכשיר שלך בלבד.
                      </li>
                      <li>
                        איננו מוכרים, משתפים או מעבירים את נתוני היומן שלך לאף צד שלישי, ואיננו
                        משתמשים בהם לפרסום, לפרופיילינג או לאימון מודלים.
                      </li>
                      <li>
                        ניתוק החשבון בהגדרות לוח השנה מוחק מהמכשיר את אסימון ההרשאה, ומפסיק מיד כל
                        גישה נוספת ליומן. אפשר גם לבטל את הגישה בכל עת מדף ההרשאות של חשבון Google
                        שלך:{' '}
                        <a
                          dir="ltr"
                          href="https://myaccount.google.com/connections"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline"
                        >
                          myaccount.google.com/connections
                        </a>
                        .
                      </li>
                    </ul>
                  </div>

                  <div className="border-t pt-5 dir-ltr text-left font-sans text-sm space-y-3 text-neutral-700">
                    <p className="font-bold">In English:</p>
                    <p>
                      Connecting a Google Calendar account is entirely optional. It happens only
                      when the user chooses to sign in from the calendar settings screen of the
                      Otzaria app, and it can be disconnected at any time.
                    </p>
                    <p>
                      <strong>What we access and why.</strong> With{' '}
                      <span className="font-mono">calendar.calendarlist.readonly</span> we read the
                      list of calendars the user is subscribed to, so that the user can choose which
                      calendars to display, and so that we can read each calendar&apos;s colour for
                      display purposes. With <span className="font-mono">calendar.events</span> we
                      read events from the calendars the user selected, only for the range of months
                      currently shown on the screen, and display them in the app&apos;s calendar view
                      next to the Hebrew dates. With the same scope we write events: when the user
                      creates, edits or deletes an event inside Otzaria, we apply the same change to
                      the user&apos;s primary Google calendar so that both sides stay in sync. We do
                      not create, modify or delete any event the user did not ask for.
                    </p>
                    <p>
                      <strong>Storage, sharing and deletion.</strong> The Otzaria project operates no
                      server that receives your calendar data. All API access is performed directly
                      from your own device to Google. The OAuth token and the events that were loaded
                      are stored locally on your device only. We do not sell, share or transfer your
                      Google user data to any third party, and we do not use it for advertising,
                      profiling or training models. Disconnecting the account in the app&apos;s
                      calendar settings deletes the stored token from the device and immediately
                      stops any further access, and you may revoke access at any time at{' '}
                      <span className="font-mono">myaccount.google.com/connections</span>. Retention
                      and deletion are described in full in the two sections below.
                    </p>
                    <p>
                      <strong>Limited Use.</strong> Otzaria&apos;s use and transfer of information
                      received from Google APIs adheres to the{' '}
                      <a
                        href="https://developers.google.com/terms/api-services-user-data-policy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        Google API Services User Data Policy
                      </a>
                      , including its Limited Use requirements.
                    </p>
                  </div>
                </div>

                <ul className="list-disc mr-6 space-y-3">
                  <li><strong>שמירת נתונים:</strong> כל ההגדרות, הסימניות והיסטוריית הלמידה בתוכנה נשמרים מקומית על המחשב או הטלפון שלך בלבד.</li>
                  <li><strong>גישה לקבצים:</strong> התוכנה מבקשת גישה לתיקיית הספרים כדי לאפשר קריאה וחיפוש. אין לתוכנה גישה לקבצים אישיים אחרים.</li>
                </ul>
              </div>

              {/* הגנה על הנתונים */}
              <div>
                <h2 className="text-2xl font-bold text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">shield</span>
                  הגנה על הנתונים / Data protection
                </h2>
                <ul className="list-disc mr-6 space-y-3">
                  <li>
                    <strong>הצפנה בהעברה:</strong> כל הפניות לממשקי Google נעשות ב-HTTPS/TLS בלבד.
                  </li>
                  <li>
                    <strong>אין שרת ביניים:</strong> לפרויקט אין שרת שמקבל את נתוני היומן. התוכנה
                    פונה ישירות מהמכשיר אל Google, ונתוני היומן אינם עוברים דרך שרת שלנו ואינם
                    נשמרים בו.
                  </li>
                  <li>
                    <strong>שמירה מקומית מוגנת:</strong> אסימון ההרשאה והאירועים שיובאו נשמרים
                    בתיקיית הנתונים הפרטית של התוכנה על המכשיר, שמוגנת בהרשאות חשבון המשתמש של
                    מערכת ההפעלה.
                  </li>
                  <li>
                    <strong>הרשאות מצומצמות:</strong> התוכנה מבקשת את ההרשאות המצומצמות ביותר
                    שהיכולות שלה מחייבות — הרשאת קריאה בלבד לרשימת היומנים, והרשאת אירועים לקריאה
                    ולכתיבה של אירועים. היא אינה מבקשת הרשאת יומן מלאה.
                  </li>
                  <li>
                    <strong>ללא שימושים נוספים:</strong> נתוני היומן אינם מועברים לצד שלישי, אינם
                    משמשים לפרסום או לפרופיילינג, ואינם משמשים לפיתוח, לשיפור או לאימון של מודלי
                    בינה מלאכותית או למידת מכונה.
                  </li>
                </ul>
              </div>

              {/* שמירת נתונים ומחיקתם */}
              <div>
                <h2 className="text-2xl font-bold text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">delete_forever</span>
                  שמירת נתונים ומחיקתם / Data retention and deletion
                </h2>
                <ul className="list-disc mr-6 space-y-3">
                  <li>
                    <strong>אסימון ההרשאה</strong> נשמר על המכשיר עד שאתה מנתק את החשבון בהגדרות
                    לוח השנה, או מבטל את הגישה בחשבון Google שלך. ניתוק מוחק אותו מהמכשיר מיד
                    ומפסיק כל גישה נוספת.
                  </li>
                  <li>
                    <strong>אירועים שיובאו מהיומן</strong> נשמרים בנתוני לוח השנה המקומיים של
                    התוכנה על המכשיר, ומתרעננים בכל סנכרון. הם נשארים על המכשיר עד שתמחק אותם
                    בתוכנה או עד להסרת התוכנה — הסרת התוכנה מוחקת את כל נתוניה המקומיים.
                  </li>
                  <li>
                    <strong>בצד שלנו אין מה למחוק:</strong> מכיוון שאין לנו שרת שמקבל את הנתונים,
                    לא נשמר אצלנו שום עותק של נתוני היומן שלך.
                  </li>
                  <li>
                    <strong>ביטול גישה מלא</strong> אפשרי בכל עת בדף ההרשאות של חשבון Google:{' '}
                    <a
                      dir="ltr"
                      href="https://myaccount.google.com/connections"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      myaccount.google.com/connections
                    </a>
                    . לאחר הביטול התוכנה אינה יכולה עוד לגשת ליומן.
                  </li>
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
                <p className="mt-6 text-sm text-on-surface/60">
                  ניתן לפנות אלינו גם בדואר אלקטרוני:{' '}
                  <a href="mailto:otzaria.1@gmail.com" dir="ltr" className="text-primary underline">
                    otzaria.1@gmail.com
                  </a>
                </p>
                <p className="mt-3 text-sm text-on-surface/60">
                  עדכון אחרון: 4 בספטמבר 2026
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}
