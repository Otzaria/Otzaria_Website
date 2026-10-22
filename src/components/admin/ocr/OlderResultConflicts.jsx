'use client'

import ResultConflictRow from './ResultConflictRow'

/**
 * תוצאות מתנגשות שלא סומנו "נבדק" מעבודות OCR מקומי קודמות של הספר (olderResultConflicts
 * מ-/api/admin/books/ocr/status) — כדי שעבודה חדשה (מכל ספק) לא תסתיר אותן. כל שורה מציינת
 * מאיזו עבודה היא, ו"סמן כנבדק" נשלח לפי מזהה העבודה שלה.
 *
 * @param {{ items: any[], onChanged?: () => void }} props
 */
export default function OlderResultConflicts({ items, onChanged }) {
  if (!Array.isArray(items) || items.length === 0) return null

  return (
    <section aria-label="תוצאות מתנגשות מעבודות קודמות" className="space-y-2 rounded-control border border-outline-variant p-3">
      <h4 className="text-sm font-bold text-on-surface">תוצאות מתנגשות מעבודות קודמות ({items.length})</h4>
      <p className="text-xs text-on-surface-variant">
        בעבודות מקומיות קודמות של הספר התקבלה תוצאה נוספת ושונה אחרי שהתוצאה הראשונה כבר התקבלה. היא
        לא הוחלה, והקובץ נשמר בשרת לבדיקה עד סימון &quot;נבדק&quot;.
      </p>
      <ul className="space-y-2">
        {items.map((c) => (
          <ResultConflictRow key={`${c.jobId}-${c.sha256}`} jobId={c.jobId} conflict={c} showJob onChanged={onChanged} />
        ))}
      </ul>
    </section>
  )
}
