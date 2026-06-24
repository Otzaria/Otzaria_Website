'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [openQuestion, setOpenQuestion] = useState(null)

  const categories = [
    { id: 'all', label: 'הכל' },
    { id: 'general', label: 'כללי' },
    { id: 'installation', label: 'התקנה' },
    { id: 'library', label: 'ספרייה' },
    { id: 'usage', label: 'שימוש' },
    { id: 'search', label: 'חיפוש' },
    { id: 'customization', label: 'התאמה אישית' },
  ]

  const faqs = [
    // כללי
    {
      id: 1,
      category: 'general',
      question: 'מהי תוכנת אוצריא?',
      answer: 'אוצריא היא תוכנה חינמית וקוד-פתוח ללימוד ספרי קודש. היא מספקת גישה לאלפי ספרים – תנ"ך, משנה, תלמוד בבלי וירושלמי, ראשונים ואחרונים, שולחן ערוך ונושאי כלים, ספרי מחשבה, מוסר, קבלה ועוד – בממשק מודרני ונוח.'
    },
    {
      id: 2,
      category: 'general',
      question: 'האם התוכנה בחינם?',
      answer: 'כן. אוצריא חינמית לחלוטין ותישאר כזו לעד. אין תשלום, אין מינוי, אין פרסומות.'
    },
    {
      id: 3,
      category: 'general',
      question: 'על אילו פלטפורמות התוכנה עובדת?',
      answer: 'אוצריא תומכת ב-Windows, Linux, macOS, Android ו-iOS. ניתן להוריד את הגרסה המתאימה מדף ההורדות.'
    },
    {
      id: 4,
      category: 'general',
      question: 'האם יש גרסת אינטרנט (Web)?',
      answer: 'לא. אוצריא היא תוכנת דסקטופ ואפליקציה לנייד. אין כרגע גרסת אינטרנט. זה מאפשר ביצועים גבוהים, חיפוש מהיר ועבודה ללא חיבור לאינטרנט.'
    },
    {
      id: 5,
      category: 'general',
      question: 'מי פיתח את אוצריא?',
      answer: 'אוצריא היא פרויקט קוד-פתוח שהחל על ידי מפתח יחיד ומתוחזק בהתנדבות על ידי קהילת המפתחים. ניתן לראות את הקוד ולתרום בגיטהאב.'
    },
    {
      id: 6,
      category: 'general',
      question: 'מה ההבדל בין "גרסה מלאה" ל"גרסה רגילה"?',
      answer: 'הגרסה המלאה (Full) כוללת את התוכנה ואת הספרייה המלאה (כ-7,000 ספרים) בקובץ התקנה אחד. הגרסה הרגילה היא קובץ קטן יותר – התוכנה בלבד – והיא תציע בהפעלה הראשונה להוריד את הספרייה.'
    },

    // התקנה
    {
      id: 7,
      category: 'installation',
      question: 'כיצד מתקינים על Windows?',
      answer: 'הורידו את קובץ ה-EXE מדף ההורדות והריצו אותו. קיימות שתי אפשרויות: "Full Installer" הכוללת את כל הדרישות (מומלצת), ו"Regular Installer" קטנה יותר הדורשת שה-Visual C++ Redistributable מותקן מראש. לאחר ההתקנה פתחו את אוצריא מתפריט התחל.'
    },
    {
      id: 8,
      category: 'installation',
      question: 'כיצד מתקינים על Linux?',
      answer: 'התקינו תחילה את החבילות הנדרשות:\nsudo apt-get install libgtk-3-0 libblkid1 liblzma5\nלאחר מכן הורידו את קובץ ה-tar.gz מדף ההורדות, חלצו אותו והריצו את Otzaria. קיים גם חבילת Full Bundle הכוללת את הספרייה – יש לחלץ ולהריץ את run-otzaria.sh.'
    },
    {
      id: 9,
      category: 'installation',
      question: 'כיצד מורידים על Android?',
      answer: 'ניתן להוריד מ-Google Play (מומלץ), או להוריד קובץ APK ישירות מדף ההורדות ולהתקין ידנית. בהפעלה הראשונה תוצע הורדת הספרייה.'
    },
    {
      id: 10,
      category: 'installation',
      question: 'כיצד מורידים על iPhone / iPad?',
      answer: 'אוצריא זמינה ב-App Store. חפשו "אוצריא" או היכנסו לדף ההורדות לקישור ישיר. בהפעלה הראשונה תוצע הורדת הספרייה.'
    },
    {
      id: 11,
      category: 'installation',
      question: 'כיצד מתקינים על macOS?',
      answer: 'הורידו את קובץ ה-ZIP מדף ההורדות וחלצו אותו. הריצו את האפליקציה תוך לחיצה על מקש ctrl (כדי לעקוף את הגנת Gatekeeper בהפעלה הראשונה). בהפעלה הראשונה תוצע הורדת הספרייה.'
    },
    {
      id: 12,
      category: 'installation',
      question: 'הורדתי את התוכנה – איפה הספרים?',
      answer: 'בהפעלה הראשונה תופיע הצעה להוריד את ספריית אוצריא. לחצו "הורד" – התוכנה תוריד ותחלץ את הספרייה אוטומטית. לחלופין, ניתן להוריד את הספרייה ידנית מ-GitHub (otzaria-library) ולהצביע עליה בהגדרות.'
    },

    // ספרייה
    {
      id: 13,
      category: 'library',
      question: 'כמה ספרים יש בספרייה?',
      answer: 'נכון לתחילת שנת תשפ"ו הספרייה כוללת כ-7,000 ספרים הכוללים את רוב ספרי היסוד: תנ"ך ומפרשיו, משנה, תלמוד בבלי וירושלמי עם ראשונים ואחרונים, שולחן ערוך ונושאי כלים, ספרי מחשבה, מוסר וקבלה ועוד.'
    },
    {
      id: 14,
      category: 'library',
      question: 'מאיפה מגיעים הספרים?',
      answer: 'רוב הספרים מגיעים מארגון ספריא (Sefaria) שעשה עבודת קודש בדיגיטציה של ספרי היסוד. ספרים נוספים הוכנסו על ידי קהילת אוצריא.'
    },
    {
      id: 15,
      category: 'library',
      question: 'האם ניתן להוסיף ספרים אישיים?',
      answer: 'כן. ניתן להוסיף קבצים בפורמט TXT, DOCX או PDF לתיקיית הספרייה. הספרים יופיעו בספרייה ויהיו ניתנים לחיפוש כמו כל ספר אחר. ניתן גם להגדיר תיקיות ספרים נוספות בהגדרות.'
    },
    {
      id: 16,
      category: 'library',
      question: 'אילו פורמטי קבצים נתמכים?',
      answer: 'אוצריא תומכת בקבצי TXT, DOCX ו-PDF. ספרי הספרייה הרשמית הם בפורמט TXT מותאם.'
    },
    {
      id: 17,
      category: 'library',
      question: 'כיצד מעדכנים את הספרייה?',
      answer: 'בהגדרות ניתן לבדוק ולהוריד עדכוני ספרייה. הספרייה מתעדכנת מעת לעת עם ספרים חדשים ותיקוני טקסט.'
    },

    // שימוש
    {
      id: 18,
      category: 'usage',
      question: 'כיצד פותחים ספר?',
      answer: 'גלשו בעץ הספרייה בצד השמאלי, אתרו את הספר הרצוי ולחצו עליו. ניתן גם לחפש לפי שם ספר בתיבת החיפוש שבחלק העליון של הספרייה.'
    },
    {
      id: 19,
      category: 'usage',
      question: 'מה זה "צורת הדף"?',
      answer: 'צורת הדף היא תצוגה המדמה את עמוד הגמרא המסורתי – הטקסט הראשי במרכז ומפרשים (רש"י, תוס וכו\') בצדדים. ניתן לפתוח צורת הדף מהתפריט הימני או אוטומטית בפתיחת ספר תלמוד.'
    },
    {
      id: 20,
      category: 'usage',
      question: 'כיצד רואים מפרשים?',
      answer: 'בעת קריאת ספר ניתן לפתוח את חלונית המפרשים מהסרגל הצד. לחצו על קישור בטקסט לפתיחת מפרש ישיר, או בחרו מפרשים מהתפריט הימני. בצורת הדף מוצגים המפרשים אוטומטית.'
    },
    {
      id: 21,
      category: 'usage',
      question: 'האם ניתן לפתוח מספר ספרים בו-זמנית?',
      answer: 'כן. אוצריא תומכת בטאבים – ניתן לפתוח ספרים רבים בו-זמנית ולעבור ביניהם. ניתן גם לפצל את המסך ולהציג שני ספרים זה לצד זה.'
    },
    {
      id: 22,
      category: 'usage',
      question: 'האם ניתן להוסיף הערות אישיות?',
      answer: 'כן. סמנו קטע טקסט, לחצו לחצן ימני ובחרו "הוסף הערה". ניתן לכתוב תוכן, להוסיף תגיות ולקבוע האם ההערה פרטית. ההערות מסומנות בצבע בתוך הטקסט ומופיעות בחלונית הצד.'
    },
    {
      id: 23,
      category: 'usage',
      question: 'האם יש תמיכה בסימניות?',
      answer: 'כן. ניתן להוסיף סימניות לכל מקום בספר מהתפריט הימני. הסימניות מופיעות בחלונית הצד ומאפשרות חזרה מהירה למקום.'
    },
    {
      id: 24,
      category: 'usage',
      question: 'כיצד מדפיסים טקסט?',
      answer: 'פתחו ספר ובחרו "הדפס" מהתפריט. התוכנה מציעה אפשרויות הדפסה מגוונות – בחירת טווח עמודים, הכללת מפרשים ועוד.'
    },
    {
      id: 25,
      category: 'usage',
      question: 'האם יש לוח שנה עברי?',
      answer: 'כן. אוצריא כוללת לוח שנה עברי עם זמני היום (נץ, שקיעה, זמני תפילה וכו\') מותאם לפי מיקום. ניתן לגשת אליו מהתפריט הראשי.'
    },
    {
      id: 26,
      category: 'usage',
      question: 'מה הם "תוספים" (Plugins)?',
      answer: 'תוספים הם הרחבות שניתן להתקין ישירות מחנות אוצריא (otzaria.org/plugins). הם מוסיפים יכולות נוספות לתוכנה כגון כלים מיוחדים, מקורות נוספים ועוד.'
    },

    // חיפוש
    {
      id: 27,
      category: 'search',
      question: 'כיצד מחפשים בספרים?',
      answer: 'לחצו על סמל החיפוש בסרגל הניווט. הקלידו את הביטוי לחיפוש והתוצאות יופיעו עם ציטוט ההקשר ושם הספר. ניתן לחפש בכלל הספרייה או בקטגוריות נבחרות.'
    },
    {
      id: 30,
      category: 'search',
      question: 'האם ניתן לחפש רק בספרים מסוימים?',
      answer: 'כן. בממשק החיפוש ניתן לסנן לפי קטגוריה (לדוגמה: תנ"ך בלבד, או הלכה בלבד). הבחירה נשמרת בהיסטוריית החיפושים.'
    },
    {
      id: 31,
      category: 'search',
      question: 'האם ניתן לחפש גם בספרים אישיים שהוספתי?',
      answer: 'כן. ספרים שהוספתם לספרייה האישית נכללים בחיפוש הכללי כמו כל ספר אחר, לאחר שעברו אינדוקס.'
    },

    // התאמה אישית
    {
      id: 32,
      category: 'customization',
      question: 'האם ניתן לשנות גופן וגודל טקסט?',
      answer: 'כן. בהגדרות ניתן לבחור מכל הגופנים התומכים עברית המותקנים במחשב, ולשנות את גודל הגופן.'
    },
    {
      id: 33,
      category: 'customization',
      question: 'האם יש מצב לילה (Dark Mode)?',
      answer: 'כן. אוצריא תומכת במצב כהה (Dark Mode). ניתן לעבור בין מצב בהיר לכהה בהגדרות.'
    },
    {
      id: 34,
      category: 'customization',
      question: 'האם ניתן להסתיר ניקוד?',
      answer: 'כן. בהגדרות ניתן לשלוט בהצגת הניקוד – תמיד, רק בתנ"ך, או ללא ניקוד כלל.'
    },
    {
      id: 35,
      category: 'customization',
      question: 'האם ניתן לבחור אילו מפרשים יופיעו בצורת הדף?',
      answer: 'כן. בצורת הדף ניתן לבחור אילו מפרשים יוצגו בחלונית הצד ולשנות את גודלם.'
    },
  ]

  const filteredFaqs = activeCategory === 'all'
    ? faqs
    : faqs.filter(faq => faq.category === activeCategory)

  return (
    <div className="min-h-screen bg-background">
      <OtzariaSoftwareHeader />

      <main className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-primary mb-4 font-frank">
              שאלות נפוצות
            </h1>
            <p className="text-on-surface/70 text-lg">
              מענה לשאלות הנפוצות ביותר על תוכנת אוצריא
            </p>
          </div>

          <div className="flex gap-3 flex-wrap justify-center mb-8">
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`px-6 py-2 rounded-full font-medium transition-all ${
                  activeCategory === category.id
                    ? 'bg-primary text-white shadow-lg'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {filteredFaqs.map((faq) => (
              <motion.div
                key={faq.id}
                layout
                className="bg-white rounded-xl overflow-hidden border border-neutral-200 shadow-sm"
              >
                <button
                  onClick={() => setOpenQuestion(openQuestion === faq.id ? null : faq.id)}
                  className="w-full flex items-center justify-between p-6 text-right hover:bg-neutral-50 transition-colors"
                >
                  <span className="text-lg font-bold text-neutral-800">{faq.question}</span>
                  <span className="material-symbols-outlined text-neutral-400 flex-shrink-0 mr-4">
                    {openQuestion === faq.id ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
                {openQuestion === faq.id && (
                  <div className="px-6 pb-6 text-neutral-600 leading-relaxed border-t border-neutral-100 pt-4 whitespace-pre-line">
                    {faq.answer}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}
