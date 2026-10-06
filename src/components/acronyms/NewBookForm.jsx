'use client'

import { useEffect, useState } from 'react'
import { matchesLibraryTitle, normalizeBookTitle, suggestLibraryTitles } from '@/lib/acronyms/normalize'

const LIBRARY_TITLES_TIMEOUT_MS = 15_000

/**
 * הוספת ספר שאין לו עדיין כינויים ברשימה. השם חייב להיות זהה לשם הספר בספריית אוצריא,
 * כי SeforimLibrary מחפש את הכינויים לפי השם המדויק.
 * @param {{onCreate:(title:string)=>void, onClose:()=>void}} props
 */
export default function NewBookForm({ onCreate, onClose }) {
  const [title, setTitle] = useState('')
  const [library, setLibrary] = useState({ status: 'loading', titles: [] })
  const [unmatched, setUnmatched] = useState(null)
  const clean = normalizeBookTitle(title)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LIBRARY_TITLES_TIMEOUT_MS)
    fetch('/api/library/book-acronyms?libraryTitles=1', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Library titles request failed')
        return r.json()
      })
      .then((data) => {
        if (!data?.success || !Array.isArray(data.titles) || !data.titles.every((t) => typeof t === 'string')) throw new Error('Invalid library titles response')
        if (!cancelled) setLibrary({ status: 'ready', titles: data.titles })
      })
      // כשל טעינה אינו חוסם ספרים שאינם ברשימה, אבל מוצג כדי שהמשתמש ידע שלא בוצעה בדיקה.
      .catch(() => !cancelled && setLibrary({ status: 'failed', titles: [] }))
      .finally(() => clearTimeout(timeout))
    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  // רשימת "מידע על ספרים" אינה כוללת כל ספר, ולכן שם שלא נמצא מקבל אזהרה ולא חסימה
  const submit = () => {
    if (!clean || library.status === 'loading') return
    if (library.status === 'failed' || matchesLibraryTitle(clean, library.titles)) return onCreate(clean)
    setUnmatched({ title: clean, suggestions: suggestLibraryTitles(clean, library.titles) })
  }

  return (
    <div className="rounded-xl border border-surface-variant bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-on-surface">ספר שאינו ברשימה</h2>
        <button type="button" onClick={onClose} aria-label="סגירה" className="p-1 rounded hover:bg-surface-variant">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <p className="text-sm text-on-surface/70 mb-3 flex items-start gap-1">
        <span className="material-symbols-outlined text-base">info</span>
        יש להעתיק את שם הספר בדיוק כפי שהוא מופיע בתוכנת אוצריא, כולל גרשיים ורווחים. כינויים לשם שאינו תואם לא ייקלטו.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setUnmatched(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && clean && submit()}
          placeholder="שם הספר המדויק"
          className="flex-1 border rounded-lg px-3 py-2"
        />
        <button type="button" disabled={!clean || library.status === 'loading'} onClick={submit} className="px-4 py-2 rounded-lg bg-primary text-on-primary disabled:opacity-50">
          המשך
        </button>
      </div>
      {library.status !== 'ready' && (
        <p role="status" className="mt-2 text-sm text-on-surface/70">
          {library.status === 'loading'
            ? 'טוען את רשימת ספרי אוצריא…'
            : 'לא ניתן לטעון את רשימת הספרים. אפשר להמשיך, אך יש לוודא שהשם זהה לשם הספר בתוכנה.'}
        </p>
      )}
      {unmatched && (
        <div className="mt-3 rounded-lg border border-warning-strong-200 bg-warning-strong-50 text-warning-strong-800 p-3 text-sm">
          <div className="flex items-start gap-1 mb-2">
            <span className="material-symbols-outlined text-base">warning</span>
            <span>
              השם &quot;{unmatched.title}&quot; לא נמצא ברשימת ספרי אוצריא. אם הוא אינו זהה לשם בתוכנה, הכינויים שלו לא יגיעו אליה.
              {unmatched.suggestions.length > 0 && ' אולי התכוונתם ל:'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {unmatched.suggestions.map((s) => (
              <button key={s} type="button" onClick={() => onCreate(s)} className="px-2 py-1 rounded-md bg-white border border-warning-strong-200">
                {s}
              </button>
            ))}
            <button type="button" onClick={() => onCreate(unmatched.title)} className="px-2 py-1 rounded-md border border-neutral-300 bg-white text-on-surface">
              להמשיך עם השם שהוזן
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
