'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

export default function DictaTutorialPage() {
  const tocItems = [
    { href: '#intro', label: 'הקדמה' },
    { href: '#structure', label: 'מבנה הכותרות' },
    { href: '#markup', label: 'סימני התוכנה' },
    { href: '#tools', label: 'התוכנות והאפשרויות' },
    { href: '#demo', label: 'הדגמה מעשית' },
    { href: '#notes', label: 'הערות חשובות' }
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
            <span className="text-on-surface">מדריך לטיפול בספרי דיקטה</span>
          </div>

          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12 glass-strong rounded-2xl p-12 border-4 border-primary"
          >
            <span className="material-symbols-outlined text-7xl text-primary mb-4 block">
              school
            </span>
            <h1 className="text-4xl font-bold text-primary-dark mb-4 font-frank">
              מדריך לטיפול בספרי דיקטה
            </h1>
            <p className="text-xl text-on-surface/70">
              הדרכה מפורטת ליצירת כותרות וניווט בספרים
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
                  הקדמה
                </h2>
                <div className="space-y-4 text-lg">
                  <p>ישנם מאות ספרים שהגיעו ממאגר חינמי, אך אינם מתאימים לאוצריא מכיוון שאין בהם אפשרות לניווט (כלומר, הם לא מחולקים לפרקים/תשובות וכדומה).</p>
                  <p><strong>המטרה:</strong> לקחת את קובץ הטקסט שקיבלנו, ולחלק אותו לכותרות.</p>
                  <p>העבודה בבסיסה ידנית, ולבקשת העורכים נוצרו תוכנות שמייעלות את העבודה, ועושות חלק ממנה בצורה אוטומטית.</p>
                </div>
                <div className="mt-6 p-4 bg-warning-strong-50 border-r-4 border-warning-strong-400 rounded">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-warning-strong-600">lightbulb</span>
                    <div>
                      <p className="text-warning-strong-900"><strong>טיפ חשוב:</strong> צרו גיבוי לעבודה מדי פעם, כך שגם אם הרצתם איזו תוכנה שעשתה פעולה לא נכונה, תוכלו לחזור אחורה.</p>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Structure Section */}
              <motion.section
                id="structure"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">account_tree</span>
                  הסבר מבנה הכותרות
                </h2>
                <div className="space-y-6">
                  <p className="text-lg">כל ספר מורכב מכותרות היררכיות. למשל, שם הספר הוא כותרת ברמה הגבוהה ביותר - <strong>רמה 1</strong>. לאחריו מגיעה <strong>רמה 2</strong> שהיא החלוקה הראשונית, <strong>רמה 3</strong> היא חלוקה פנימית וכן הלאה.</p>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="p-6 bg-surface-variant rounded-xl">
                      <h4 className="text-xl font-bold text-primary mb-4">דוגמה 1: מסכת</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 p-3 bg-danger-100 rounded-lg">
                          <span className="w-8 h-8 bg-danger-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
                          <span className="font-bold">מסכת ברכות</span>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-info-100 rounded-lg mr-6">
                          <span className="w-8 h-8 bg-info-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
                          <span>פרק ראשון</span>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-neutral-100 rounded-lg mr-12">
                          <span className="w-8 h-8 bg-neutral-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
                          <span>דף ב עמוד א</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 bg-surface-variant rounded-xl">
                      <h4 className="text-xl font-bold text-primary mb-4">דוגמה 2: ספר שו"ת</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 p-3 bg-danger-100 rounded-lg">
                          <span className="w-8 h-8 bg-danger-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
                          <span className="font-bold">שו"ת הרשב"א</span>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-info-100 rounded-lg mr-6">
                          <span className="w-8 h-8 bg-info-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
                          <span>חלק א</span>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-neutral-100 rounded-lg mr-12">
                          <span className="w-8 h-8 bg-neutral-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
                          <span>סימן א</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Markup Section */}
              <motion.section
                id="markup"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">code</span>
                  סימני התוכנה
                </h2>
                <div className="space-y-6">
                  <p className="text-lg">כדי לסמן כותרות בקובץ הטקסט, משתמשים בתגיות HTML:</p>
                  
                  <div className="space-y-4">
                    <div className="p-6 bg-surface-variant rounded-xl">
                      <h4 className="text-xl font-bold text-primary-dark mb-3">כותרת רמה 1</h4>
                      <pre className="bg-neutral-800 text-white p-4 rounded overflow-x-auto text-sm">
                        <code>&lt;h1&gt;שם הספר&lt;/h1&gt;</code>
                      </pre>
                    </div>

                    <div className="p-6 bg-surface-variant rounded-xl">
                      <h4 className="text-xl font-bold text-primary-dark mb-3">כותרת רמה 2</h4>
                      <pre className="bg-neutral-800 text-white p-4 rounded overflow-x-auto text-sm">
                        <code>&lt;h2&gt;פרק ראשון&lt;/h2&gt;</code>
                      </pre>
                    </div>

                    <div className="p-6 bg-surface-variant rounded-xl">
                      <h4 className="text-xl font-bold text-primary-dark mb-3">כותרת רמה 3</h4>
                      <pre className="bg-neutral-800 text-white p-4 rounded overflow-x-auto text-sm">
                        <code>&lt;h3&gt;סימן א&lt;/h3&gt;</code>
                      </pre>
                    </div>
                  </div>

                  <div className="p-4 bg-info-50 border-r-4 border-info-400 rounded">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-info-600">info</span>
                      <div>
                        <p className="text-info-900"><strong>הערה:</strong> ניתן להשתמש עד רמה 6 (h1 עד h6), אך ברוב המקרים מספיקות 3-4 רמות.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Tools Section */}
              <motion.section
                id="tools"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">build</span>
                  התוכנות והאפשרויות
                </h2>
                <div className="space-y-6">
                  <p className="text-lg">ישנן מספר דרכים לעבוד על הקבצים:</p>
                  
                  <div className="space-y-4">
                    <div className="p-6 bg-surface-variant rounded-xl">
                      <h4 className="text-xl font-bold text-primary mb-3">1. עריכה ידנית</h4>
                      <p className="mb-3">השתמשו בעורך טקסט כמו Notepad++ או VS Code:</p>
                      <ul className="list-disc mr-6 space-y-2">
                        <li>פתחו את קובץ הטקסט</li>
                        <li>חפשו את הכותרות</li>
                        <li>הוסיפו תגיות HTML מתאימות</li>
                        <li>שמרו את הקובץ</li>
                      </ul>
                    </div>

                    <div className="p-6 bg-surface-variant rounded-xl">
                      <h4 className="text-xl font-bold text-primary mb-3">2. שימוש בחיפוש והחלפה</h4>
                      <p className="mb-3">אם יש דפוס קבוע בכותרות, תוכלו להשתמש בחיפוש והחלפה:</p>
                      <ul className="list-disc mr-6 space-y-2">
                        <li>חפשו דפוס חוזר (למשל "פרק")</li>
                        <li>החליפו אותו ב-"{'<'}h2{'>'}פרק" ובסוף השורה הוסיפו "{'<'}/h2{'>'}"</li>
                        <li>בדקו שהתוצאה נכונה</li>
                      </ul>
                    </div>

                    <div className="p-6 bg-surface-variant rounded-xl">
                      <h4 className="text-xl font-bold text-primary mb-3">3. כלים אוטומטיים</h4>
                      <p className="mb-3">ניתן להשתמש בכלי AI או סקריפטים:</p>
                      <ul className="list-disc mr-6 space-y-2">
                        <li>ChatGPT או Claude - תנו להם חלק מהטקסט ובקשו לזהות כותרות</li>
                        <li>סקריפטים מותאמים אישית</li>
                        <li>תוכנות המרה מיוחדות</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Demo Section */}
              <motion.section
                id="demo"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">play_circle</span>
                  הדגמה מעשית
                </h2>
                <div className="space-y-6">
                  <p className="text-lg">דוגמה לעבודה על קטע מספר שו"ת:</p>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-xl font-bold text-danger-600 mb-3">לפני העריכה:</h4>
                      <div className="p-4 bg-danger-50 border-2 border-danger-200 rounded-lg">
                        <pre className="text-sm whitespace-pre-wrap">
                            <div>שו"ת הרשב"א</div>
                            <div>חלק ראשון</div>
                            <div>סימן א</div>
                            <div>שאלה: מה דין כהן שנטמא...</div>
                            <div>תשובה: הנה התשובה...</div>
                            <div>סימן ב</div>
                            <div>שאלה: מה דין לוי שעבר...</div>
                            <div>תשובה: כך נראה לי...</div>
                        </pre>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xl font-bold text-success-600 mb-3">אחרי העריכה:</h4>
                      <div className="p-4 bg-success-50 border-2 border-success-200 rounded-lg">
                        <pre className="text-sm whitespace-pre-wrap">
                            <div>&lt;h1&gt;שו"ת הרשב"א&lt;/h1&gt;</div>
                            <div>&lt;h2&gt;חלק ראשון&lt;/h2&gt;</div>
                            <div>&lt;h3&gt;סימן א&lt;/h3&gt;</div>
                            <div>שאלה: מה דין כהן שנטמא...</div>
                            <div>תשובה: הנה התשובה...</div>
                            <div>&lt;h3&gt;סימן ב&lt;/h3&gt;</div>
                            <div>שאלה: מה דין לוי שעבר...</div>
                            <div>תשובה: כך נראה לי...</div>
                        </pre>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-warning-strong-50 border-r-4 border-warning-strong-400 rounded">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-warning-strong-600">tips_and_updates</span>
                      <div>
                        <p className="text-warning-strong-900"><strong>טיפ:</strong> התחילו עם קטע קטן כדי לבדוק שהתוצאה נכונה, ורק אז המשיכו לכל הספר.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>

              {/* Notes Section */}
              <motion.section
                id="notes"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-strong rounded-xl p-8"
              >
                <h2 className="text-3xl font-bold text-primary-dark mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-4xl">note</span>
                  הערות חשובות
                </h2>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="p-4 bg-danger-50 border-r-4 border-danger-400 rounded">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-danger-600">warning</span>
                        <div>
                          <p className="text-danger-900 font-bold mb-2">זהירות:</p>
                          <ul className="list-disc mr-6 space-y-1 text-danger-900">
                            <li>וודאו שהתגיות נסגרות נכון ({'<'}h1{'>'}...{'<'}/h1{'>'})</li>
                            <li>אל תשכחו את הסלש בתגית הסגירה</li>
                            <li>השתמשו ברמות נכונות (h1 לכותרת הראשית, h2 לחלוקה הבאה וכו')</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-info-50 border-r-4 border-info-400 rounded">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-info-600">info</span>
                        <div>
                          <p className="text-info-900 font-bold mb-2">טיפים נוספים:</p>
                          <ul className="list-disc mr-6 space-y-1 text-info-900">
                            <li>שמרו גיבוי לפני שמתחילים</li>
                            <li>עבדו בחלקים קטנים ובדקו התוצאה</li>
                            <li>השתמשו בעורך טקסט עם הדגשת תחביר (Syntax Highlighting)</li>
                            <li>בדקו את התוצאה באוצריא לפני שמסיימים</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-success-50 border-r-4 border-success-400 rounded">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-success-600">check_circle</span>
                        <div>
                          <p className="text-success-900 font-bold mb-2">בדיקת איכות:</p>
                          <ul className="list-disc mr-6 space-y-1 text-success-900">
                            <li>פתחו את הספר באוצריא ובדקו שהניווט עובד</li>
                            <li>וודאו שכל הכותרות מופיעות בעץ הניווט</li>
                            <li>בדקו שאין כותרות ריקות או שגויות</li>
                            <li>וודאו שהתוכן לא נפגע בתהליך</li>
                          </ul>
                        </div>
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
                className="p-6 bg-success-50 border-r-4 border-success-400 rounded-xl flex items-start gap-4"
              >
                <span className="material-symbols-outlined text-4xl text-success-600">celebration</span>
                <div>
                  <p className="text-success-900 text-lg"><strong>כל הכבוד!</strong> עכשיו אתם יודעים כיצד לעבד ספרי דיקטה ולהפוך אותם לספרים עם ניווט מלא באוצריא!</p>
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
                    <h4 className="text-2xl font-bold text-primary-dark mb-3">זקוק לעזרה?</h4>
                    <p className="mb-4">אם יש לך שאלות על עיבוד ספרי דיקטה, פנה לקהילה או לצוות הפיתוח.</p>
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

