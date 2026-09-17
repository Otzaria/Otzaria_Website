'use client'

// מודאל שיבוץ מקומי לתוסף מאושר — כל סימון/ביטול נשמר מיידית (addPlugin/removePlugin).
// קומפוננטה מוצגתית בלבד: כל תקשורת עם השרת נעשית דרך onToggle שמסופק מבחוץ.
//
// Props:
// - plugin: { _id, name } — התוסף שמשובץ
// - categories: [{ id, name, icon, isVisible }] — כל קטגוריות החנות
// - assignedCategoryIds: string[] — מזהי הקטגוריות שהתוסף משובץ אליהן כרגע
// - processingCategoryId: string|null — מזהה הקטגוריה שבתהליך עדכון (לנעילת שאר התיבות)
// - onToggle(plugin, category, checked): נקרא בשינוי תיבת סימון
// - onClose(): נקרא בסגירה

import { createPortal } from 'react-dom'

export default function AssignCategoriesModal({ plugin, categories, assignedCategoryIds, processingCategoryId, onToggle, onClose }) {
  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white p-6">
          <h2 className="text-xl font-bold text-on-surface">שיבוץ בקטגוריות: {plugin.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-neutral-100"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-4 p-6">
          <p className="text-sm text-on-surface/60">כל שינוי נשמר מיידית.</p>

          {categories.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-on-surface/50">
              עדיין לא נוצרו קטגוריות — ניתן ליצור בלשונית &quot;סידור החנות&quot;
            </p>
          ) : (
            <div className="space-y-2">
              {categories.map((category) => {
                const checked = assignedCategoryIds.includes(category.id)
                const processing = processingCategoryId === category.id
                return (
                  <label
                    key={category.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 transition-colors hover:bg-neutral-50 ${
                      category.isVisible ? '' : 'opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={processingCategoryId !== null}
                      onChange={(e) => onToggle(plugin, category, e.target.checked)}
                      className="h-5 w-5 rounded border-neutral-300 text-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    />
                    {category.icon && (
                      <span className="material-symbols-outlined text-base text-on-surface/50">{category.icon}</span>
                    )}
                    <span className="flex-1 font-medium text-on-surface">{category.name}</span>
                    {!category.isVisible && (
                      <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-bold text-on-surface/60">מוסתרת</span>
                    )}
                    {processing && (
                      <span className="material-symbols-outlined animate-spin text-base text-primary">progress_activity</span>
                    )}
                  </label>
                )
              })}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-neutral-200 px-6 py-3 font-bold text-on-surface transition-colors hover:bg-neutral-50"
          >
            סגור
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
