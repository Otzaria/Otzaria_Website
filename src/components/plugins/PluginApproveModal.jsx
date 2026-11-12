'use client'

// מודאל אישור תוסף חדש — מחליף את ה-showConfirm הטקסטואלי בזרימת האישור.
// מציג רשימת checkboxes של הקטגוריות הגלויות לשיבוץ אופציונלי + "הוסף לנבחרים בדף הבית".
// משמש רק לאישור תוסף חדש; אישור עדכון (pendingUpdate) נשאר ב-confirm הרגיל.

// ui/Dialog: פוקוס נלכד וחוזר לכפתור "אישור" שבכרטיס; בזמן האישור (submitting) החלון לא נסגר
// מ-Esc/רקע/X — כמו קודם, כשכפתורי הסגירה היו מושבתים בזמן הזה.

import { useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Loader from '@/components/ui/Loader'
import AppIcon from '@/components/ui/AppIcon'
import CheckboxField from '@/components/plugins/form/CheckboxField'
import { categoriesShowIcons, categoryIcon } from '@/components/plugins/categoryIcons'

export default function PluginApproveModal({ plugin, onClose, onConfirm }) {
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [categories, setCategories] = useState([])
  const [categoriesError, setCategoriesError] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [addToFeatured, setAddToFeatured] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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

  const showIcons = categoriesShowIcons(categories)

  return (
    <Dialog
      title="לאשר את התוסף?"
      onClose={onClose}
      dismissible={!submitting}
      footer={
        <>
          <Button
            type="button"
            variant="filled"
            icon="check_circle"
            onClick={handleConfirm}
            loading={submitting}
            className="flex-1 sm:flex-none"
          >
            {submitting ? 'מאשר…' : 'אשר'}
          </Button>
          <Button type="button" variant="outlined" onClick={onClose} disabled={submitting} className="flex-1 sm:flex-none">
            ביטול
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <p className="text-body-md text-on-surface">
          ״{plugin.name}״ יוצג בחנות לכל המשתמשים. המפתח יקבל הודעה במייל.
        </p>

        <section aria-labelledby="approve-categories-title" className="space-y-3">
          <h3 id="approve-categories-title" className="text-title-sm text-on-surface">
            שיבוץ בקטגוריות (לא חובה, אפשר לשנות אחר כך)
          </h3>
          <p className="text-body-sm text-on-surface-variant">
            תוסף שלא ישובץ יהיה זמין בחיפוש ובדף &quot;כל התוספים&quot;, אבל לא יופיע בדף הבית של החנות.
            אפשר לסמן כמה קטגוריות.
          </p>
          {loadingCategories ? (
            <div role="status" className="flex items-center gap-2 text-body-sm text-on-surface-variant">
              <Loader size="inline" decorative className="text-base" />
              <span>טוען קטגוריות…</span>
            </div>
          ) : categoriesError ? (
            <p role="alert" className="flex items-start gap-1.5 text-body-sm text-error">
              <AppIcon name="error" className="mt-0.5 text-[1.1rem]" />
              <span>לא הצלחנו לטעון את הקטגוריות. אפשר לאשר עכשיו ולשבץ אחר כך.</span>
            </p>
          ) : categories.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">אין עדיין קטגוריות גלויות בחנות.</p>
          ) : (
            <ul className="custom-scrollbar max-h-56 space-y-0.5 overflow-y-auto rounded-(--radius-control) border border-outline-variant p-1.5">
              {categories.map((category) => (
                <li key={category.id}>
                  <CheckboxField
                    id={`approve-category-${category.id}`}
                    framed={false}
                    checked={selectedIds.includes(category.id)}
                    onChange={() => toggleCategory(category.id)}
                    // כלל אייקוני הקטגוריות (components/plugins/categoryIcons): ברשימה — לכולן או לאף אחת
                    icon={showIcons ? <AppIcon name={categoryIcon(category)} className="mt-0.5 text-[1.15rem] text-on-surface-variant" /> : undefined}
                    label={
                      <>
                        <span>{category.name}</span>
                        <span className="ms-2 text-body-sm text-on-surface-variant tabular-nums">({category.plugins.length} משובצים)</span>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <CheckboxField
          id="approve-add-featured"
          checked={addToFeatured}
          onChange={setAddToFeatured}
          icon={<AppIcon name="star" className="mt-0.5 text-[1.25rem] text-rating" />}
          label="הוסף לנבחרים בדף הבית"
        />
      </div>
    </Dialog>
  )
}
