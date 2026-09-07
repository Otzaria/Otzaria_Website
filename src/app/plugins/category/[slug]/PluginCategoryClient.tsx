'use client'

// חלק הלקוח של דף הקטגוריה — מקבל את נתוני הקטגוריה כ-props מה-Server
// Component (page.tsx) במקום לשלוף אותם בעצמו ב-fetch, אבל שומר על כל
// האינטראקטיביות: התקנה ישירה (useDirectInstall) + דיאלוגים.

import { useEffect } from 'react'
import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import { useDirectInstall } from '@/components/plugins/useDirectInstall'
import { useDialog } from '@/components/providers/DialogContext'
import PluginCard from '@/components/plugins/PluginCard'
import PluginSearchBox from '@/components/plugins/PluginSearchBox'
import type { CategoryData } from './types'

interface PluginCategoryClientProps {
  category: CategoryData | null
  notFound: boolean
}

export default function PluginCategoryClient({ category, notFound }: PluginCategoryClientProps) {
  const { installState, install } = useDirectInstall()
  const { showAlert } = useDialog() as { showAlert: (title: string, message: string) => void }

  // הודעת דיאלוג רגילה של האתר כשמגיע דיווח תוצאה מאוצריא
  useEffect(() => {
    if (installState.phase === 'success') {
      showAlert('הצלחה', installState.updated ? 'התוסף עודכן בהצלחה באוצריא!' : 'התוסף הותקן בהצלחה באוצריא!')
    } else if (installState.phase === 'failure') {
      showAlert(
        'שגיאה',
        installState.error
          ? `ההתקנה נכשלה: ${installState.error}`
          : 'ההתקנה נכשלה. אפשר לנסות שוב או להוריד את הקובץ ולהתקין ידנית.'
      )
    } else if (installState.phase === 'no_app') {
      showAlert(
        'אוצריא לא נמצאה',
        'נראה שאוצריא אינה מותקנת במחשב זה — בקשת ההתקנה לא הגיעה לתוכנה. ניתן להוריד את אוצריא מהאתר, או להוריד את קובץ התוסף ולהתקינו ידנית.'
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installState])

  if (notFound || !category) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <OtzariaSoftwareHeader showAuth />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-lg bg-white rounded-2xl border border-neutral-100 py-16 px-8">
            <span className="material-symbols-outlined text-5xl text-primary/40 mb-4 inline-block">search_off</span>
            <h1 className="text-3xl font-bold text-on-surface mb-3">הקטגוריה לא נמצאה</h1>
            <p className="text-on-surface/60 leading-relaxed mb-6">
              ייתכן שהקטגוריה הוסרה או שהקישור שגוי. אפשר לחזור לחנות התוספים ולעיין משם.
            </p>
            <Link
              href="/plugins"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors"
            >
              <span>לחנות התוספים</span>
              <span aria-hidden="true">←</span>
            </Link>
          </div>
        </main>
        <OtzariaSoftwareFooter />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OtzariaSoftwareHeader showAuth />

      <main className="flex-1">
        {/* Category Header */}
        <section className="py-8 px-4 bg-white border-b border-neutral-100">
          <div className="container mx-auto max-w-6xl">
            {/* פירורי לחם */}
            <nav className="flex items-center gap-2 text-sm text-on-surface/60 mb-4" aria-label="פירורי לחם">
              <Link href="/plugins" className="text-primary hover:underline font-medium">
                חנות התוספים
              </Link>
              <span aria-hidden="true">‹</span>
              <span className="font-bold text-on-surface">{category.name}</span>
            </nav>

            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-2xl">
                <div className="flex items-center gap-3 mb-2">
                  {category.icon && (
                    <span className="material-symbols-outlined text-4xl text-primary">
                      {category.icon}
                    </span>
                  )}
                  <h1 className="text-4xl font-bold text-on-surface font-frank leading-tight">
                    {category.name}
                  </h1>
                </div>
                {category.description && (
                  <p className="text-lg text-on-surface/70 leading-relaxed mb-2">
                    {category.description}
                  </p>
                )}
                <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-on-surface/50">
                  <span>{category.total} תוספים בקטגוריה</span>
                  {category.sortMode === 'rating' && (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <span aria-hidden="true">·</span>
                      <span className="material-symbols-outlined text-sm leading-none text-warning-500">star</span>
                      <span>מסודרים לפי דירוג המשתמשים</span>
                    </span>
                  )}
                </p>
              </div>

              <div className="w-full md:w-80">
                <PluginSearchBox placeholder="חיפוש בכל החנות..." />
              </div>
            </div>
          </div>
        </section>

        {/* Plugins Grid */}
        <section className="py-12 px-4">
          <div className="container mx-auto max-w-6xl">
            {category.plugins.length === 0 ? (
              <div className="text-center py-16 px-4 bg-white rounded-2xl border border-neutral-100">
                <h2 className="text-2xl font-bold text-on-surface mb-3">
                  בקרוב יתווספו תוספים לקטגוריה זו
                </h2>
                <p className="text-on-surface/60 leading-relaxed mb-6">
                  בינתיים אפשר לעיין ברשימה המלאה של כל התוספים בחנות.
                </p>
                <Link
                  href="/plugins/all"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors"
                >
                  <span>לכל התוספים</span>
                  <span aria-hidden="true">←</span>
                </Link>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {category.plugins.map(plugin => (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    installState={installState}
                    onInstall={install}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}
