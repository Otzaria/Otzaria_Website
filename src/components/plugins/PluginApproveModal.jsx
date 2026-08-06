'use client'

// מודאל אישור תוסף חדש — מחליף את ה-showConfirm הטקסטואלי בזרימת האישור.
// מציג רשימת checkboxes של הקטגוריות הגלויות לשיבוץ אופציונלי + "הוסף לנבחרים בדף הבית".
// משמש רק לאישור תוסף חדש; אישור עדכון (pendingUpdate) נשאר ב-confirm הרגיל.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function PluginApproveModal({ plugin, onClose, onConfirm }) {
  const [mounted, setMounted] = useState(false)
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [categories, setCategories] = useState([])
  const [categoriesError, setCategoriesError] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [addToFeatured, setAddToFeatured] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadCategories = async () => {
      try {
        setLoadingCategories(true)
        const response = await fetch('/api/admin/plugin-categories')
        if (!response.ok) throw new Error('Failed to load categories')
        const data = await response.json()
        if (!cancelled) {
          // רק קטגוריות גלויות — שיבוץ לקטגוריה מוסתרת נעשה מלשונית סידור החנות
          setCategories(data.filter((category) => category.isVisible))
        }
      } catch (error) {
        console.error('Error loading categories for approve modal:', error)
        if (!cancelled) setCategoriesError(true)
      } finally {
        if (!cancelled) setLoadingCategories(false)
      }
    }
    loadCategories()
    return () => { cancelled = true }
  }, [])

  const toggleCategory = (categoryId) => {
    setSelectedIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    )
  }

  const handleConfirm = async () => {
    try {
      setSubmitting(true)
      await onConfirm({ categoryIds: selectedIds, addToFeatured })
    } finally {
      setSubmitting(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4" onClick={submitting ? undefined : onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white p-6">
          <h2 className="text-2xl font-bold text-on-surface">אישור תוסף</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 transition-colors hover:bg-neutral-100 disabled:opacity-50"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-6 p-6">
          <p className="leading-relaxed text-on-surface/80">
            אישור התוסף <strong>&quot;{plugin.name}&quot;</strong> יהפוך אותו לזמין לכל המשתמשים.
          </p>

          <section className="space-y-3">
            <h3 className="font-bold text-on-surface">
              שיכון בקטגוריות — אופציונלי, ניתן לשינוי גם אחר-כך
            </h3>
            <p className="text-sm text-on-surface/60">
              אין חובה לשבץ: תוסף שלא ישובץ יהיה זמין בחיפוש ובדף &quot;כל התוספים&quot;, אך לא יופיע בדף הבית של החנות.
              אפשר לסמן כמה קטגוריות.
            </p>
            {loadingCategories ? (
              <div className="flex items-center gap-2 text-sm text-on-surface/60">
                <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                <span>טוען קטגוריות...</span>
              </div>
            ) : categoriesError ? (
              <p className="text-sm text-danger-600">לא הצלחנו לטעון את הקטגוריות — ניתן לאשר ולשבץ מאוחר יותר.</p>
            ) : categories.length === 0 ? (
              <p className="text-sm text-on-surface/60">אין עדיין קטגוריות גלויות בחנות.</p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-neutral-200 p-3">
                {categories.map((category) => (
                  <label
                    key={category.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(category.id)}
                      onChange={() => toggleCategory(category.id)}
                      className="h-5 w-5 rounded border-neutral-300 text-primary focus:ring-2 focus:ring-primary/20"
                    />
                    {category.icon && (
                      <span className="material-symbols-outlined text-base text-on-surface/50">{category.icon}</span>
                    )}
                    <span className="font-medium text-on-surface">{category.name}</span>
                    <span className="text-xs text-on-surface/50">({category.plugins.length} משובצים)</span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 transition-colors hover:bg-neutral-50">
            <input
              type="checkbox"
              checked={addToFeatured}
              onChange={(e) => setAddToFeatured(e.target.checked)}
              className="h-5 w-5 rounded border-neutral-300 text-primary focus:ring-2 focus:ring-primary/20"
            />
            <span className="material-symbols-outlined text-warning-600">star</span>
            <span className="font-medium text-on-surface">הוסף לנבחרים בדף הבית</span>
          </label>

          <div className="flex gap-4 border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-success-600 px-6 py-3 font-bold text-white transition-colors hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  <span>מאשר...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">check_circle</span>
                  <span>אישור</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-neutral-200 px-6 py-3 font-bold text-on-surface transition-colors hover:bg-neutral-50 disabled:opacity-50"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
