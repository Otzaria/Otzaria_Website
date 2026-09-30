'use client'

import { useState } from 'react'
import { normalizeBookTitle } from '@/lib/acronyms/normalize'

/**
 * הוספת ספר שאין לו עדיין כינויים ברשימה. השם חייב להיות זהה לשם הספר בספריית אוצריא,
 * כי SeforimLibrary מחפש את הכינויים לפי השם המדויק.
 * @param {{onCreate:(title:string)=>void, onClose:()=>void}} props
 */
export default function NewBookForm({ onCreate, onClose }) {
  const [title, setTitle] = useState('')
  const clean = normalizeBookTitle(title)

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
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="שם הספר המדויק" className="flex-1 border rounded-lg px-3 py-2" />
        <button type="button" disabled={!clean} onClick={() => onCreate(clean)} className="px-4 py-2 rounded-lg bg-primary text-on-primary disabled:opacity-50">
          המשך
        </button>
      </div>
    </div>
  )
}
