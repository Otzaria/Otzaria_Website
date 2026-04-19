'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

export default function SearchTutorialPage() {
  const tocItems = [
    { href: '#intro', label: 'הוראות כלליות' },
    { href: '#basic-search', label: 'חיפוש רגיל ומקורב' },
    { href: '#filter-books', label: 'חיפוש בחלק מהספרים' },
    { href: '#exact-search', label: 'חיפוש מדויק' },
    { href: '#wildcards', label: 'השלמת אותיות' },
    { href: '#proximity', label: 'מרחק בין מילים' },
    { href: '#or-search', label: 'חיפוש אחד משניים' },
    { href: '#exclude', label: 'שלילת מילה' }
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
            <span className="text-on-surface">מדריך חיפוש באוצריא</span>
          </div>

          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12 glass-strong rounded-2xl p-12 border-4 border-primary"
          >
            <span className="material-symbols-outlined text-7xl text-primary mb-4 block">
              search
            </span>
            <h1 className="text-4xl font-bold text-primary-dark mb-4 font-frank">
              מדריך חיפוש באוצריא
            </h1>
            <p className="text-xl text-on-surface/70">
              למד כיצד לחפש ביעילות ולמצוא בדיוק מה שאתה צריך
            </p>
          </motion.div>

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
              <motion.section
                id="intro"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">info</span>
                  הוראות כלליות
                </h2>
                <p className="text-lg mb-6">
                  מדריך זה מחולק לכותרות לפי הנושא, ויעזור לך להפיק את המרב מיכולות החיפוש המתקדמות של אוצריא.
                </p>
                <div className="p-4 bg-blue-50 border-r-4 border-blue-400 rounded">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-blue-600">lightbulb</span>
                    <div>
                      <p className="text-blue-900 mb-2"><strong>לתשומת לב:</strong> אם החיפוש מגיב "אין תוצאות" בכל חיפוש שעשיתם, כנראה לא יצרתם אינדקס עדיין.</p>
                      <p className="text-blue-900">כדי ליצור אינדקס יש ללחוץ על מקש עדכון אינדקס (המסומן בעיגול) ולאשר את הפעולה בחלון שיפתח לכם. כמו כן, יש לעדכן את האינדקס גם לאחר הוספת ספרים חדשים לתוכנה.</p>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Basic Search Section */}
              <motion.section
                id="basic-search"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">search</span>
                  חיפוש רגיל וחיפוש מקורב
                </h2>
                <div className="space-y-6">
                  <p>בתוכנת אוצריא, יש שתי אופציות בחלון חיפוש:</p>

                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">חיפוש רגיל (מדויק)</h3>
                    <p className="mb-4">האופציה ברירת מחדל היא של חיפוש מדויק בהקשת מילים שלמות ורצופות של הטקסט שתרצו למצוא.</p>
                    <div className="p-6 bg-surface-variant rounded-xl">
                      <h4 className="font-bold text-lg mb-3 text-primary-dark">דוגמה</h4>
                      <p className="mb-2">אם תחפשו את הביטוי <span className="font-bold text-primary">"מצוה הבאה בעבירה"</span> תקבלו תוצאות מדויקות של ביטוי זה.</p>
                      <p>ואם תחפשו את הביטוי <span className="font-bold text-primary">"במצוה הבאה בעבירה"</span> תקבלו תוצאות מדויקות של ביטוי זה.</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">חיפוש מקורב (בערך)</h3>
                    <p className="mb-4">האופציה השנייה היא של חיפוש מקורב, כלומר, חיפוש "בערך". בחיפוש זה, לא צריך להקליד מילים שלמות וגם לא צריך להקליד את המילים הרצופות של הטקסט.</p>
                    <div className="p-6 bg-surface-variant rounded-xl">
                      <h4 className="font-bold text-lg mb-3 text-primary-dark">דוגמה</h4>
                      <p>תוכלו להקליד <span className="font-bold text-primary">"מצוה בעבירה"</span> ולקבל גם את כל התוצאות שמופיע בהם "מצוה הבאה בעבירה" וכדומה.</p>
                    </div>
                  </div>

                  <div className="p-4 bg-red-50 border-r-4 border-red-400 rounded">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-red-600">warning</span>
                      <div>
                        <p className="text-red-900 font-bold mb-2">שימו לב:</p>
                        <ul className="list-disc mr-6 space-y-1 text-red-900">
                          <li>אין להשתמש בראשי תיבות בתוך חיפוש מקורב, כגון "רש"י" אלא יש לכתוב <code className="bg-red-100 px-2 py-1 rounded">רש?י</code></li>
                          <li>אין להשתמש בתווים הבאים בתוך חיפוש מקורב: <code className="bg-red-100 px-2 py-1 rounded">+ - & | ! ( ) &#123; &#125; [ ] ^ " ~ * ?</code></li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-orange-50 border-r-4 border-orange-400 rounded">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-orange-600">tips_and_updates</span>
                      <div>
                        <p className="text-orange-900"><strong>טיפ:</strong> החיפוש המקורב פועל בצורה משוכללת ומבצע חיפוש מקיף בכל האופציות הקרובות, והוא מציג בתוצאות החיפוש את כל הקטעים בהם מופיעים המילים שחיפשתם גם אם אינם רצופות וגם אם אינם מדויקות לגמרי.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Filter Books Section */}
              <motion.section
                id="filter-books"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">filter_list</span>
                  חיפוש בחלק מהספרים
                </h2>
                <p className="text-lg mb-6">
                  קיבלתם ריבוי תוצאות וקשה לכם למצוא את מה שחיפשתם? תוכלו לצמצם את הספרים בהם יופיע החיפוש.
                </p>
                <div className="space-y-4">
                  {[
                    {
                      num: 1,
                      title: 'אופציה א: סינון ספרים ספציפיים',
                      items: [
                        'לחצו על "סינון", תופיע לפניכם רשימת כל הספרים',
                        'הקלידו את שם הספר (לדוגמא "קובץ שיטות קמאי")',
                        'כשהוא יופיע לחצו על הריבוע בצד שמאל והסירו ממנו את הסימון',
                        'תוכלו להוריד את הסימון מכל הספרים על ידי לחיצה על "הכל" בראש הרשימה'
                      ]
                    },
                    {
                      num: 2,
                      title: 'חיפוש בספר ספציפי',
                      items: [
                        'הסירו תחילה את הסימון מכל הספרים',
                        'הקלידו את שם הספר שתרצו ולסמן אותו',
                        'בדרך זו תוכלו לחפש בכל ספרי הרשב"א על ידי הקשת "רשב"א" וסימון על ידי "הכל"'
                      ]
                    },
                    {
                      num: 3,
                      title: 'אופציה ב: בחירה לפי קטגוריה',
                      items: [
                        'לחצו תחילה על "הכל" בראש הרשימה והסירו ממנו את הסימון',
                        'לחצו על כפתור "ראשונים" בתיבת החיפוש',
                        'לחצו על כפתור סיום'
                      ]
                    },
                    {
                      num: 4,
                      title: 'אופציה ג: בחירה לפי תיקיות',
                      items: [
                        'לחצו על "עץ ספרים"',
                        'לחצו על התיקייה הראשית - תפתח את התיקיות הפנימיות',
                        'סמנו על התיקיות או הספרים שתרצו לחפש בהם',
                        'הסירו את הסימון ממה שלא תרצו להכניס לחיפוש'
                      ]
                    }
                  ].map((option) => (
                    <div key={option.num} className="flex gap-4 p-6 bg-surface-variant rounded-xl">
                      <div className="w-12 h-12 bg-primary text-on-primary rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0">
                        {option.num}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-bold text-primary-dark mb-3">{option.title}</h4>
                        <ul className="list-disc mr-6 space-y-2">
                          {option.items.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>

              {/* Exact Search Section */}
              <motion.section
                id="exact-search"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">format_quote</span>
                  חיפוש מדויק והצמדת מילים
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">שימוש בגרשיים</h3>
                    <p className="mb-4">כדי לחפש ביטוי מדויק ברצף, השתמשו בגרשיים:</p>
                    <div className="p-4 bg-primary-container rounded-lg border-2 border-primary">
                      <p className="text-xl font-bold text-primary-dark">"ירושלים של מעלה"</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">חיפוש מספר ביטויים</h3>
                    <p className="mb-4">אם תרצו לחפש מקומות שמופיע בהם כמה מונחים:</p>
                    <div className="p-4 bg-primary-container rounded-lg border-2 border-primary">
                      <p className="text-xl font-bold text-primary-dark">"בית המקדש" "ירושלים של מטה"</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">הצמדת מילים עם מקף</h3>
                    <p className="mb-4">תוכלו גם להשתמש עם "-" כדי להצמיד מילים בחיפוש:</p>
                    <div className="p-4 bg-primary-container rounded-lg border-2 border-primary">
                      <p className="text-xl font-bold text-primary-dark">מעלה-של-ירושלים</p>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Wildcards Section */}
              <motion.section
                id="wildcards"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">star</span>
                  השלמת אותיות ע"י ? או *
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">תו יחיד - ?</h3>
                    <p className="mb-4">כדי לבצע חיפוש תווים כלליים של תו בודד, השתמש בסימן "?".</p>
                    <div className="p-4 bg-primary-container rounded-lg border-2 border-primary">
                      <p className="text-sm text-on-surface/70 mb-2">דוגמה לחיפוש המילה ירושלים:</p>
                      <p className="text-xl font-bold text-primary-dark">ירושל?ם</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-bold text-primary mb-4">מספר תווים - *</h3>
                    <p className="mb-4">כדי לבצע חיפוש תווים כלליים של מספר תווים, השתמש בסימן "*".</p>
                    <div className="p-4 bg-primary-container rounded-lg border-2 border-primary">
                      <p className="text-sm text-on-surface/70 mb-2">דוגמה:</p>
                      <p className="text-xl font-bold text-primary-dark">ירוש*</p>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Additional Sections */}
              <motion.section
                id="proximity"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">straighten</span>
                  מרחק בין מילים
                </h2>
                <p className="text-lg mb-4">
                  תוכלו לחפש מילים שנמצאות במרחק מסוים זו מזו באמצעות הסימן ~
                </p>
                <div className="p-4 bg-primary-container rounded-lg border-2 border-primary">
                  <p className="text-sm text-on-surface/70 mb-2">דוגמה - חיפוש "בית" ו"מקדש" במרחק של עד 5 מילים:</p>
                  <p className="text-xl font-bold text-primary-dark">"בית מקדש"~5</p>
                </div>
              </motion.section>

              <motion.section
                id="or-search"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">alt_route</span>
                  חיפוש אחד משניים (OR)
                </h2>
                <p className="text-lg mb-4">
                  תוכלו לחפש מקומות שמופיע בהם אחד משני ביטויים באמצעות OR או |
                </p>
                <div className="p-4 bg-primary-container rounded-lg border-2 border-primary">
                  <p className="text-xl font-bold text-primary-dark">ירושלים OR ציון</p>
                  <p className="text-sm text-on-surface/70 mt-2">או:</p>
                  <p className="text-xl font-bold text-primary-dark">ירושלים | ציון</p>
                </div>
              </motion.section>

              <motion.section
                id="exclude"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">block</span>
                  שלילת מילה (NOT)
                </h2>
                <p className="text-lg mb-4">
                  תוכלו לשלול מילה מסוימת מהחיפוש באמצעות - או NOT
                </p>
                <div className="p-4 bg-primary-container rounded-lg border-2 border-primary">
                  <p className="text-sm text-on-surface/70 mb-2">דוגמה - חיפוש "ירושלים" אבל לא "ציון":</p>
                  <p className="text-xl font-bold text-primary-dark">ירושלים -ציון</p>
                  <p className="text-sm text-on-surface/70 mt-2">או:</p>
                  <p className="text-xl font-bold text-primary-dark">ירושלים NOT ציון</p>
                </div>
              </motion.section>

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
                    <p className="mb-4">אם יש לך שאלות נוספות על החיפוש, בקר בדף השאלות הנפוצות.</p>
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

