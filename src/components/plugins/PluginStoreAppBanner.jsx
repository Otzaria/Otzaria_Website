'use client'

import { useEffect, useState } from 'react'

const REPO_URL = 'https://github.com/Otzaria/otzaria-plugin-store'

function formatSize(bytes) {
  if (!bytes) return null
  return `כ-${Math.round(bytes / (1024 * 1024))}MB`
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
}

const HIGHLIGHTS = [
  { icon: 'extension', text: 'כל התוספים ארוזים בפנים מראש' },
  { icon: 'wifi_off', text: 'עובדת גם בלי חיבור לאינטרנט' },
  { icon: 'download_done', text: 'מתקינים ישירות לתוך אוצריא' },
]

/**
 * כפתור להורדת "חנות התוספים" — אפליקציית Windows נפרדת שמכילה מראש את כל
 * התוספים. בלחיצה נפתח דיאלוג הסבר, וההורדה מתחילה רק לאחר אישור.
 */
export default function PluginStoreAppBanner() {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [release, setRelease] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const show = setTimeout(() => setVisible(true), 10)
    const onKey = event => {
      if (event.key !== 'Escape') return
      setVisible(false)
      setTimeout(() => setOpen(false), 200)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(show)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openDialog = async () => {
    setOpen(true)
    if (release || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/plugin-store-app-release')
      if (res.ok) setRelease(await res.json())
    } catch {
      // בלי פרטי גרסה — ההורדה תפנה לדף ההפצות בגיטהאב
    } finally {
      setLoading(false)
    }
  }

  const closeDialog = () => {
    setVisible(false)
    setTimeout(() => setOpen(false), 200)
  }

  const size = formatSize(release?.size)
  const updated = formatDate(release?.updatedAt)
  const downloadHref = release?.url || `${REPO_URL}/releases`

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-primary/20 text-primary rounded-xl font-bold hover:bg-primary/5 transition-colors"
      >
        <span className="material-symbols-outlined text-xl">desktop_windows</span>
        <span>הורדת החנות למחשב</span>
      </button>

      {open && (
        <div
          onClick={closeDialog}
          className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] transition-opacity duration-200 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div
            onClick={event => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="הורדת חנות התוספים למחשב"
            className={`glass-strong w-full max-w-lg overflow-hidden rounded-2xl text-right shadow-2xl transition-all duration-200 ease-out ${
              visible ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'
            }`}
          >
            <div className="px-7 pt-7 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-[34px]">desktop_windows</span>
              </div>
              <h3 className="mb-2 font-frank text-xl font-bold text-on-surface">
                חנות התוספים למחשב
              </h3>
              <p className="leading-relaxed text-on-surface/70">
                תוכנה נפרדת למחשבי Windows, שכל התוספים כבר נמצאים בתוכה. אפשר לעיין בהם
                ולהתקין אותם ישירות לאוצריא, גם במחשב שאין בו חיבור לאינטרנט.
              </p>
            </div>

            <ul className="mt-6 space-y-3 px-7">
              {HIGHLIGHTS.map(item => (
                <li key={item.icon} className="flex items-center gap-3 text-on-surface/80">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-lg">{item.icon}</span>
                  </span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap justify-center gap-2 px-7">
              <span className="rounded-full bg-surface-variant/40 px-3 py-1.5 text-sm text-on-surface/60">
                מיועדת ל-Windows
              </span>
              <span className="rounded-full bg-surface-variant/40 px-3 py-1.5 text-sm text-on-surface/60">
                {loading ? 'בודק גודל…' : size ? `גודל ${size}` : 'קובץ הרצה אחד'}
              </span>
              {updated && (
                <span className="rounded-full bg-surface-variant/40 px-3 py-1.5 text-sm text-on-surface/60">
                  עודכנה ב-{updated}
                </span>
              )}
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 border-t border-surface-variant/60 px-7 py-5 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-xl border border-surface-variant px-5 py-2.5 font-medium text-on-surface/70 transition-all duration-200 hover:bg-surface-variant/30 hover:text-on-surface"
              >
                ביטול
              </button>
              <a
                href={downloadHref}
                // בכרטיסיה חדשה: אם שליפת ה-release נכשלה ההורדה מפנה לדף ההפצות
                // בגיטהאב, ואין רוצים לזרוק את המשתמש מהחנות בגלל זה.
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeDialog}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-bold text-on-primary shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl"
              >
                <span className="material-symbols-outlined text-xl">download</span>
                <span>הורדה</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
