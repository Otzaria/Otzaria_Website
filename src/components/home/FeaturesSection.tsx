// Server Component: תוכן סטטי לגמרי, בלי JavaScript בדפדפן. אפקטי הריחוף
// (הרמה והגדלה של הכרטיס, תנועת האייקון) היו whileHover של framer-motion — מה
// שגרר כ-37KB gzip של framer-motion לדף הבית רק בשבילם. כעת הם מעברי CSS.
const features = [
  {
    icon: 'auto_stories',
    title: 'מאגר עצום',
    description: 'אלפי ספרי קודש זמינים לקריאה ולימוד'
  },
  {
    icon: 'verified',
    title: 'דיוק מקסימלי',
    description: 'מערכת בקרת איכות מתקדמת לטקסטים מדויקים'
  },
  {
    icon: 'search',
    title: 'חיפוש מתקדם',
    description: 'מצאו כל פסוק, מאמר או מושג בקלות'
  },
  {
    icon: 'edit_note',
    title: 'עריכה משותפת',
    description: 'ספרים רבים נוספו על ידי הקהילה'
  },
  {
    icon: 'devices',
    title: 'פלטפורמות מרובות',
    description: 'עובד על Windows, Linux, Android, iOS ו-macOS'
  },
  {
    icon: 'palette',
    title: 'ממשק מודרני',
    description: 'עיצוב נקי ופשוט עם תמיכה במצב כהה ובהתאמה אישית'
  },
  {
    icon: 'description',
    title: 'פורמטים מגוונים',
    description: 'תמיכה בקבצי TXT, DOCX ו-PDF'
  },
  {
    icon: 'volunteer_activism',
    title: 'חינם לחלוטין',
    description: 'התוכנה חינמית לחלוטין ותישאר כזו לעד'
  }
]

export default function FeaturesSection() {
  return (
    <section id="features" className="py-20 px-4 bg-surface relative overflow-hidden">
      <div className="container mx-auto relative z-10">
        <div className="animate-enter-down">
          <h2 className="text-4xl font-bold text-center mb-4 text-on-surface">
            למה לבחור באוצריא?
          </h2>
          <p className="text-center text-on-surface/70 mb-12 max-w-2xl mx-auto">
            פלטפורמה מתקדמת המשלבת טכנולוגיה חדישה עם כבוד למסורת
          </p>
        </div>

        {/* כרטיסי היכולות היו כולם opacity:0 ב-HTML של השרת — כלומר כל תוכן
            החלק הזה נראה רק אחרי hydration. ההשהיה המדורגת עברה ל-CSS. */}
        <div className="flex flex-wrap justify-center gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              style={{ animationDelay: `${index * 0.1}s` }}
              className="glass p-6 rounded-xl shadow-lg hover:shadow-2xl transition-[box-shadow,translate,scale] duration-300 ease-out hover:-translate-y-2 hover:scale-105 cursor-pointer group w-full md:w-[calc(50%-12px)] lg:w-[calc(33.33%-16px)] animate-enter-up"
            >
              {/* w-fit כדי שהסיבוב וההגדלה יהיו סביב מרכז הגליף. mr-auto (פיזי, לא
                  me-auto: ל-Material Symbols יש direction:ltr, כך שהשוליים הלוגיים
                  מתהפכים) מצמיד אותו לשמאל הכרטיס כמו ה-block ברוחב מלא שהיה קודם.
                  הריחוף על האייקון עצמו (לא על כל הכרטיס): נענוע חד-פעמי שחוזר
                  לזקוף, כמו ה-whileHover של framer-motion שהיה כאן. */}
              <span className="material-symbols-outlined text-6xl text-primary mb-4 block w-fit mr-auto transition-[scale] duration-500 hover:scale-110 motion-safe:hover:animate-[icon-wiggle_0.5s_ease-in-out]">
                {feature.icon}
              </span>
              <h3 className="text-xl font-bold mb-2 text-on-surface group-hover:text-primary transition-colors">
                {feature.title}
              </h3>
              <p className="text-on-surface/70">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
