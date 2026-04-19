'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

export default function DocsPage() {
  const [openSections, setOpenSections] = useState(['installation', 'usage'])

  const toggleSection = (section) => {
    setOpenSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    )
  }

  const tutorials = [
    {
      href: '/docs/installation',
      icon: 'install_desktop',
      title: 'מדריך הפעלת תוכנת אוצריא',
      description: 'הוראות מפורטות להתקנה, הפעלה והוספת ספרייה - כולל טיפים ואפשרויות מתקדמות'
    },
    {
      href: '/docs/search',
      icon: 'search',
      title: 'מדריך חיפוש באוצריא',
      description: 'למד כיצד לחפש ביעילות - חיפוש מדויק, מקורב, סינון ספרים, והשלמת אותיות'
    },
    {
      href: '/docs/development',
      icon: 'code',
      title: 'מדריך פיתוח - עריכת אוצריא',
      description: 'למד כיצד לערוך ולשפר את תוכנת אוצריא בעצמך - גם ללא ידע מעמיק בתכנות'
    },
    {
      href: '/docs/dicta',
      icon: 'edit',
      title: 'מדריך לטיפול בספרי דיקטה',
      description: 'הדרכה מפורטת ליצירת כותרות וניווט בספרים - כולל כלים אוטומטיים והדגמות מעשיות'
    }
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <OtzariaSoftwareHeader />

      <main className="py-12 px-4">
        <div className="container mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <aside className="lg:col-span-1">
              <div className="glass-strong rounded-xl p-6 sticky top-24 bg-white border border-gray-200">
                <h3 className="text-xl font-bold text-primary mb-4">תוכן עניינים</h3>
                <nav className="space-y-2">
                  <div>
                    <button
                      onClick={() => toggleSection('installation')}
                      className="flex items-center justify-between w-full text-right p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <span className="font-medium">התקנה</span>
                      <motion.span
                        animate={{ rotate: openSections.includes('installation') ? 180 : 0 }}
                        className="material-symbols-outlined text-sm"
                      >
                        expand_more
                      </motion.span>
                    </button>
                    {openSections.includes('installation') && (
                      <div className="mr-4 mt-2 space-y-1 border-r-2 border-gray-100 pr-2">
                        <a href="#windows" className="block p-2 text-sm text-gray-600 hover:text-primary transition-colors">Windows</a>
                        <a href="#linux" className="block p-2 text-sm text-gray-600 hover:text-primary transition-colors">Linux</a>
                        <a href="#android" className="block p-2 text-sm text-gray-600 hover:text-primary transition-colors">Android</a>
                        <a href="#ios" className="block p-2 text-sm text-gray-600 hover:text-primary transition-colors">iOS</a>
                        <a href="#macos" className="block p-2 text-sm text-gray-600 hover:text-primary transition-colors">macOS</a>
                      </div>
                    )}
                  </div>

                  <div>
                    <button
                      onClick={() => toggleSection('usage')}
                      className="flex items-center justify-between w-full text-right p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <span className="font-medium">שימוש בסיסי</span>
                      <motion.span
                        animate={{ rotate: openSections.includes('usage') ? 180 : 0 }}
                        className="material-symbols-outlined text-sm"
                      >
                        expand_more
                      </motion.span>
                    </button>
                    {openSections.includes('usage') && (
                      <div className="mr-4 mt-2 space-y-1 border-r-2 border-gray-100 pr-2">
                        <a href="#library" className="block p-2 text-sm text-gray-600 hover:text-primary transition-colors">דפדוף בספרייה</a>
                        <a href="#search" className="block p-2 text-sm text-gray-600 hover:text-primary transition-colors">חיפוש</a>
                        <a href="#reading" className="block p-2 text-sm text-gray-600 hover:text-primary transition-colors">קריאה</a>
                        <a href="#bookmarks" className="block p-2 text-sm text-gray-600 hover:text-primary transition-colors">סימניות</a>
                      </div>
                    )}
                  </div>

                  <Link href="#tutorials" className="block p-2 hover:bg-gray-100 rounded-lg transition-colors font-medium">מדריכים נוספים</Link>
                </nav>
              </div>
            </aside>

            {/* Main Content */}
            <article className="lg:col-span-3">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl p-8 mb-8 border border-gray-200 shadow-sm"
              >
                <h1 className="text-4xl font-bold text-primary mb-6 font-frank">
                  מדריך למשתמש
                </h1>

                {/* Installation Section */}
                <section id="installation" className="mb-12">
                  <h2 className="text-3xl font-bold text-gray-800 mb-4">התקנה</h2>
                  <p className="text-lg text-gray-600 mb-6">
                    אוצריא זמינה למגוון פלטפורמות. בחר את ההוראות המתאימות למערכת שלך:
                  </p>

                  {/* Windows */}
                  <div id="windows" className="mb-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
                    <h3 className="text-2xl font-bold text-primary mb-4 flex items-center gap-3">
                      <span className="material-symbols-outlined text-3xl">desktop_windows</span>
                      Windows
                    </h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-white rounded-lg shadow-sm">
                        <h4 className="font-bold text-lg mb-2">שלבי ההתקנה</h4>
                        <ol className="list-decimal mr-6 space-y-2">
                          <li>הורד את קובץ ה-.exe מדף הבית</li>
                          <li>הפעל את הקובץ והמתן להתקנה</li>
                          <li>פתח את התוכנה והתחל ללמוד!</li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  {/* Android */}
                  <div id="android" className="mb-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
                    <h3 className="text-2xl font-bold text-primary mb-4 flex items-center gap-3">
                      <span className="material-symbols-outlined text-3xl">phone_android</span>
                      Android
                    </h3>
                    <div className="p-4 bg-white rounded-lg shadow-sm">
                      <h4 className="font-bold text-lg mb-2">התקנה מ-Google Play</h4>
                      <ol className="list-decimal mr-6 space-y-2">
                        <li>היכנס ל-Google Play</li>
                        <li>חפש "אוצריא" והתקן</li>
                        <li>בהפעלה הראשונה תתבקש להוריד את הספרייה</li>
                      </ol>
                    </div>
                  </div>
                </section>

                {/* Tutorials Links */}
                <section id="tutorials" className="mb-12">
                  <h2 className="text-3xl font-bold text-gray-800 mb-6">מדריכים נוספים</h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {tutorials.map((tutorial, i) => (
                      <Link
                        key={i}
                        href={tutorial.href}
                        className="flex flex-col gap-4 p-6 bg-gray-50 hover:bg-primary/5 rounded-xl transition-all hover:shadow-md border border-gray-200 group"
                      >
                        <span className="material-symbols-outlined text-4xl text-primary group-hover:scale-110 transition-transform w-fit">
                          {tutorial.icon}
                        </span>
                        <div>
                          <h4 className="text-xl font-bold text-gray-800 mb-2">{tutorial.title}</h4>
                          <p className="text-gray-600">{tutorial.description}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              </motion.div>
            </article>
          </div>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}
