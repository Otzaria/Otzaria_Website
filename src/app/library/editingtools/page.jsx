'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/layout/Header'
import { useDialog } from '@/components/providers/DialogContext'

export default function EditingToolsPage() {
  const { showAlert } = useDialog()
  const [releases, setReleases] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReleases()
  // fetch חד-פעמי בעליה; fetchReleases מוחרג
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchReleases = async () => {
    try {
      const response = await fetch('https://api.github.com/repos/YOSEFTT/EditingDictaBooks/releases/latest', {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Otzaria-Website'
        }
      })

      if (!response.ok) throw new Error('Failed to fetch releases')

      const data = await response.json()
      const assets = data.assets || []

      setReleases({
        version: data.tag_name,
        installer: assets.find(a => a.name.includes('Installation'))?.browser_download_url,
        portable: assets.find(a => !a.name.includes('Installation') && a.name.endsWith('.exe'))?.browser_download_url,
        releaseUrl: data.html_url
      })
    } catch (error) {
      console.error('Error fetching releases:', error)
      showAlert('שגיאה', 'לא ניתן לטעון את גרסאות התוכנה')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadOfflineEditor = () => {
    const link = document.createElement('a')
    link.href = '/export-editor/dicta-editor-offline.html'
    link.download = 'dicta-editor-offline.html'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDownloadHeaderProcessor = async () => {
    try {
      const response = await fetch('/api/header-processor')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'מעבד כותרות ומחלק קבצים.html'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading header processor:', error)
      showAlert('שגיאה', 'לא ניתן להוריד את כלי עיבוד הכותרות')
    }
  }

  const handleDownloadLinkNotes = async () => {
    try {
      const response = await fetch('https://raw.githubusercontent.com/Otzaria/Link-Notes/main/index.html')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'מקשר-הערות-אוטומטי.html'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading link notes:', error)
      showAlert('שגיאה', 'לא ניתן להוריד את כלי מקשר ההערות')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-3 font-frank">
              כלי עריכה
            </h1>
            <p className="text-on-surface/70 text-lg">
              הורד כלים לעריכת ספרים ללא חיבור לאינטרנט
            </p>
          </div>

          <div className="space-y-8">
            {/* תוכנת עריכת ספרי דיקטה */}
            <div className="glass p-8 rounded-2xl">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-primary">
                      desktop_windows
                    </span>
                  </div>
                </div>

                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-2 font-frank">
                    תוכנת עריכת ספרי דיקטה
                  </h2>
                  <p className="text-on-surface/70 mb-6">
                    תוכנה ייעודית לעריכת ספרי דיקטה עם כלים מתקדמים לניקוי טקסט, הוספת כותרות, ניקוד ועוד
                  </p>

                  {loading ? (
                    <div className="flex items-center gap-2 text-on-surface/60">
                      <span className="material-symbols-outlined animate-spin">progress_activity</span>
                      <span>טוען מידע על גרסאות...</span>
                    </div>
                  ) : releases ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm text-on-surface/60">
                        <span className="material-symbols-outlined text-base">info</span>
                        <span>גרסה נוכחית: {releases.version}</span>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {releases.installer && (
                          <a
                            href={releases.installer}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg font-bold hover:bg-accent transition-colors"
                          >
                            <span className="material-symbols-outlined">download</span>
                            הורד תוכנת התקנה
                          </a>
                        )}

                        {releases.portable && (
                          <a
                            href={releases.portable}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-secondary text-on-primary rounded-lg font-bold hover:bg-accent transition-colors"
                          >
                            <span className="material-symbols-outlined">download</span>
                            הורד גרסה ניידת
                          </a>
                        )}

                        <a
                          href={releases.releaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-6 py-3 border-2 border-primary text-primary rounded-lg font-bold hover:bg-primary/10 transition-colors"
                        >
                          <span className="material-symbols-outlined">open_in_new</span>
                          פרטים נוספים
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="text-on-surface/60">
                      לא ניתן לטעון מידע על גרסאות
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* עורך אופליין */}
            <div className="glass p-8 rounded-2xl">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-accent/10 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-accent">
                      edit_document
                    </span>
                  </div>
                </div>

                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-2 font-frank">
                    עורך אופליין
                  </h2>
                  <p className="text-on-surface/70 mb-6">
                    ממשק עריכה מלא כמו באתר, בקובץ HTML יחיד שניתן להוריד ולהשתמש בו ללא חיבור לאינטרנט
                  </p>

                  <div className="space-y-4">
                    <div className="bg-primary-container/50 border border-primary/20 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-primary mt-0.5">
                          lightbulb
                        </span>
                        <div className="text-sm text-on-surface/80">
                          <p className="font-bold mb-1">איך זה עובד?</p>
                          <ul className="list-disc list-inside space-y-1 mr-4">
                            <li>הורד קובץ HTML יחיד</li>
                            <li>פתח אותו בדפדפן (Chrome, Firefox, Edge)</li>
                            <li>ערוך טקסטים עם כל הכלים המתקדמים</li>
                            <li>שמור את העבודה למחשב שלך</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleDownloadOfflineEditor}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-on-primary rounded-lg font-bold hover:bg-primary transition-colors"
                    >
                      <span className="material-symbols-outlined">download</span>
                      הורד עורך אופליין
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* עורך מנחם */}
            <div className="glass p-8 rounded-2xl">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-secondary/10 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-secondary">
                      description
                    </span>
                  </div>
                </div>

                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-2 font-frank">
                    עורך מנחם
                  </h2>
                  <p className="text-on-surface/70 mb-6">
                    תבנית וורד (dotm) לעריכת קבצי טקסט של אוצריא בתוכנת Word, עם כרטיסייה ייעודית לפתיחה, עריכה ושמירה נוחה
                  </p>

                  <div className="space-y-4">
                    <div className="bg-secondary-container/50 border border-secondary/20 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-secondary mt-0.5">
                          lightbulb
                        </span>
                        <div className="text-sm text-on-surface/80">
                          <p className="font-bold mb-1">איך זה עובד?</p>
                          <ul className="list-disc list-inside space-y-1 mr-4">
                            <li>הורד את קובץ התבנית והסר את חסימת האינטרנט (לחצן ימני ← מאפיינים)</li>
                            <li>פתח את הקובץ — תיפתח כרטיסיית "עורך לאוצריא" בסרגל הכלים</li>
                            <li>לחץ על "פתיחה" כדי לטעון קובץ טקסט — ייפתח ללא תגי עיצוב</li>
                            <li>לאחר עריכה — "הגדרות שמירה" ← "הוספת תגים" ← "שמירה"</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <a
                        href="https://otzariausercontent.serveftp.com/forum/assets/uploads/files/1780575153786-%D7%A2%D7%95%D7%A8%D7%9A-%D7%9E%D7%A0%D7%97%D7%9D-15.dotm"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-secondary text-on-primary rounded-lg font-bold hover:bg-accent transition-colors"
                      >
                        <span className="material-symbols-outlined">download</span>
                        הורד עורך מנחם
                      </a>

                      <a
                        href="https://otzaria.org/forum/topic/740"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 border-2 border-secondary text-secondary rounded-lg font-bold hover:bg-secondary/10 transition-colors"
                      >
                        <span className="material-symbols-outlined">forum</span>
                        מדריך ודיון בפורום
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* כלי לחלוקת ספרים וטיפול בכותרות */}
            <div className="glass p-8 rounded-2xl">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-secondary/10 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-secondary">
                      splitscreen
                    </span>
                  </div>
                </div>

                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-2 font-frank">
                    מעבד כותרות ומחלק קבצים
                  </h2>
                  <p className="text-on-surface/70 mb-6">
                    כלי מתקדם לחלוקת ספרים, נירמול כותרות, חיבור כותרות דינמי וסינכרון שמות קבצים
                  </p>

                  <div className="space-y-4">
                    <div className="bg-secondary-container/50 border border-secondary/20 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-secondary mt-0.5">
                          checklist
                        </span>
                        <div className="text-sm text-on-surface/80">
                          <p className="font-bold mb-1">יכולות הכלי:</p>
                          <ul className="list-disc list-inside space-y-1 mr-4">
                            <li>חיתוך מסמכים חכם לפי רמת כותרת</li>
                            <li>נירמול היררכיה של כותרות</li>
                            <li>חיבור כותרות דינמי (למשל דף לעמוד)</li>
                            <li>חיפוש והחלפה ממוקד בכותרות</li>
                            <li>סינכרון כותרת H1 ושם הקובץ</li>
                            <li>עורך ידני מובנה</li>
                            <li>הוספת שם מחבר ושם ספר לקבצים</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={handleDownloadHeaderProcessor}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-secondary text-on-primary rounded-lg font-bold hover:bg-accent transition-colors"
                      >
                        <span className="material-symbols-outlined">download</span>
                        הורד כלי עיבוד כותרות
                      </button>

                      <a
                        href="https://otzaria.org/forum/topic/838"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 border-2 border-secondary text-secondary rounded-lg font-bold hover:bg-secondary/10 transition-colors"
                      >
                        <span className="material-symbols-outlined">forum</span>
                        מדריך ודיון בפורום
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* מקשר הערות אוטומטי */}
            <div className="glass p-8 rounded-2xl">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-primary">
                      link
                    </span>
                  </div>
                </div>

                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-2 font-frank">
                    מקשר הערות אוטומטי
                  </h2>
                  <p className="text-on-surface/70 mb-6">
                    כלי לקישור אוטומטי בין הערות בקובץ הספר לקובץ ההערות הנפרד, יוצר קובץ JSON המקשר בין ההערות
                  </p>

                  <div className="space-y-4">
                    <div className="bg-primary-container/50 border border-primary/20 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-primary mt-0.5">
                          auto_fix_high
                        </span>
                        <div className="text-sm text-on-surface/80">
                          <p className="font-bold mb-1">איך זה עובד?</p>
                          <ul className="list-disc list-inside space-y-1 mr-4">
                            <li>טען קובץ ספר וקובץ הערות נפרד</li>
                            <li>בחר את התו שעוטף את מספרי ההערות (ברירת מחדל: sup)</li>
                            <li>התוכנה מזהה ומקשרת אוטומטית בין ההערות</li>
                            <li>יוצר קובץ JSON לתיקיית links באוצריא</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <a
                        href="https://otzaria.github.io/Link-Notes/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg font-bold hover:bg-accent transition-colors"
                      >
                        <span className="material-symbols-outlined">open_in_new</span>
                        פתח כלי מקשר הערות
                      </a>

                      <button
                        onClick={handleDownloadLinkNotes}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-secondary text-on-primary rounded-lg font-bold hover:bg-accent transition-colors"
                      >
                        <span className="material-symbols-outlined">download</span>
                        הורד לעבודה אופליין
                      </button>

                      <a
                        href="https://otzaria.org/forum/topic/934"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 border-2 border-primary text-primary rounded-lg font-bold hover:bg-primary/10 transition-colors"
                      >
                        <span className="material-symbols-outlined">forum</span>
                        מדריך ודיון בפורום
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* מידע נוסף */}
            <div className="glass-strong p-6 rounded-xl">
              <div className="flex items-start gap-4">
                <span className="material-symbols-outlined text-2xl text-primary">
                  help
                </span>
                <div>
                  <h3 className="font-bold mb-2">זקוק לעזרה?</h3>
                  <p className="text-sm text-on-surface/70 mb-3">
                    למדריכים מפורטים על שימוש בכלי העריכה, בקר בעמוד המדריכים או בפורום הקהילה
                  </p>
                  <div className="flex gap-3">
                    <a
                      href="/docs"
                      className="text-sm text-primary hover:underline font-medium"
                    >
                      מדריכים
                    </a>
                    <span className="text-on-surface/30">•</span>
                    <a
                      href="https://otzaria.org/forum"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline font-medium"
                    >
                      פורום
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
