'use client'

import { useState } from 'react'

/**
 * RenameBookDialog - חלון עריכת שם ספר וקטגוריה (מדף ניהול הספרים)
 *
 * מנהל באופן עצמאי את שדות הטופס (שם חדש, קטגוריה חדשה) המאותחלים מתוך
 * הספר הנוכחי. ההורה אחראי להרכיב את הקומפוננטה רק כאשר יש ספר בעריכה
 * (renamingBook) ולפרק אותה כדי לאפס את הטופס בפתיחה הבאה - בדיוק כמו
 * ההתנהגות המקורית בדף.
 *
 * Props:
 * - book: הספר הנערך (renamingBook)
 * - categories: רשימת הקטגוריות הקיימות ({name, color}[])
 * - onClose(): סגירת הדיאלוג ללא שמירה
 * - onSave(newName, newCategory): שמירת השם/הקטגוריה החדשים
 */
export default function RenameBookDialog({ book, categories, onClose, onSave }) {
  const [newName, setNewName] = useState(book.name)
  const [newCategory, setNewCategory] = useState(book.category || 'כללי')

  const isPersonal = book.isPrivate || book.ownerId
  const isUnchanged = newName === book.name && newCategory === (book.category || 'כללי')

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b bg-neutral-50 flex justify-between items-center">
          <h3 className="font-bold text-lg text-neutral-800">שינוי שם ספר</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-2">שם הספר החדש</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-base"
              autoFocus
            />
          </div>

          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <label className="block text-sm font-medium text-neutral-700">קטגוריה</label>
              {isPersonal && (
                <span className="text-xs text-danger-500 bg-danger-50 px-2 py-0.5 rounded-full border border-danger-100 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[10px]">lock</span>
                  ספר אישי - לא ניתן לשינוי
                </span>
              )}
            </div>

            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              disabled={isPersonal}
              className="w-full border border-neutral-300 rounded-lg p-3 focus:ring-2 focus:ring-primary outline-none bg-white disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed"
            >
              {categories && categories.length > 0 ? (
                categories.map((cat, idx) => (
                  <option key={idx} value={cat.name}>{cat.name}</option>
                ))
              ) : (
                <option value="כללי">כללי</option>
              )}
            </select>
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <button
              onClick={onClose}
              className="px-5 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg font-medium transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={() => onSave(newName, newCategory)}
              className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!newName.trim() || isUnchanged}
            >
              שמור שינויים
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
