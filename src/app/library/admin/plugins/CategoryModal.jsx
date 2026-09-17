'use client'

// מודאל יצירה/עריכה של קטגוריה — כולל ניהול השיבוצים במצב עריכה.
// מוטמע בלשונית "סידור החנות" (StoreLayoutTab), אך עצמאי לחלוטין: מנהל את כל
// הבקשות ל-API של הקטגוריה הבודדת בעצמו ומדווח להורה רק דרך onClose/onChanged.
//
// Props:
// - category: קטגוריה קיימת לעריכה, או null ליצירת קטגוריה חדשה
// - pickerOptions: רשימת התוספים המאושרים — לשדה ההוספה (autocomplete) בשיבוץ
// - onClose(): נקרא בסגירה
// - onChanged(): נקרא אחרי שמירה/מחיקה שמשנה את רשימת הקטגוריות בהורה (async)

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '@/components/providers/DialogContext'
import { moveItem, reorderList } from './listReorder'
import { useDragReorder, PluginPicker, OrderedPluginRow } from './StoreLayoutShared'

// זהה ל-SLUG_RE בצד השרת (src/lib/pluginCategoryAdmin.js)
// נבדק: לינארי — מפריד '-' חובה בכל איטרציה מונע נסיגה קטסטרופלית
// eslint-disable-next-line security/detect-unsafe-regex
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// גזירת slug בסיסית בצד הלקוח — אותיות לטיניות קטנות, ספרות ומקפים בלבד
function clientSlugify(name) {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const hasHebrew = (text) => /[֐-׿]/.test(text || '')

export default function CategoryModal({ category, pickerOptions, onClose, onChanged }) {
  const { showConfirm, showAlert } = useDialog()
  const isEdit = Boolean(category)

  const [form, setForm] = useState({
    name: category?.name || '',
    slug: category?.slug || '',
    description: category?.description || '',
    icon: category?.icon || '',
    showOnHome: category?.showOnHome === true,
    homeLimit: category?.homeLimit || 6,
    sortMode: category?.sortMode === 'manual' ? 'manual' : 'rating',
    manualTopCount: category?.manualTopCount || 0,
    isVisible: category ? category.isVisible : true
  })
  const [slugTouched, setSlugTouched] = useState(isEdit)
  const [assigned, setAssigned] = useState(category?.plugins || [])
  const [assignDirty, setAssignDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingAssign, setSavingAssign] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const assignedDnd = useDragReorder((from, to) => {
    setAssigned((prev) => reorderList(prev, from, to))
    setAssignDirty(true)
  })

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // הצעת slug אוטומטית לשמות לטיניים — כל עוד המשתמש לא ערך את השדה ידנית
  const handleNameChange = (value) => {
    setForm((prev) => ({
      ...prev,
      name: value,
      slug: slugTouched ? prev.slug : clientSlugify(value)
    }))
  }

  const slugValid = SLUG_RE.test(form.slug)
  const needsManualSlug = hasHebrew(form.name) && !form.slug
  const canSave = form.name.trim().length > 0 && slugValid && !saving

  const handleSaveDetails = async () => {
    if (isEdit && form.slug !== category.slug) {
      const confirmed = await showConfirm(
        'שינוי slug',
        'שינוי ה-slug ישבור קישורים קיימים לדף הקטגוריה. להמשיך?'
      )
      if (!confirmed) return
    }

    try {
      setSaving(true)
      const payload = {
        name: form.name.trim(),
        slug: form.slug,
        description: form.description.trim(),
        icon: form.icon.trim(),
        showOnHome: form.showOnHome,
        homeLimit: Number(form.homeLimit),
        sortMode: form.sortMode,
        manualTopCount: Number(form.manualTopCount) || 0
      }

      const response = isEdit
        ? await fetch(`/api/admin/plugin-categories/${category.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update', data: { ...payload, isVisible: form.isVisible } })
          })
        : await fetch('/api/admin/plugin-categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'שגיאה בשמירת הקטגוריה')
      }

      await onChanged()
      if (isEdit) {
        await showAlert('נשמר', 'פרטי הקטגוריה נשמרו בהצלחה')
      } else {
        onClose()
        await showAlert('קטגוריה נוצרה', `הקטגוריה "${payload.name}" נוצרה בהצלחה`)
      }
    } catch (error) {
      console.error('Error saving category:', error)
      showAlert('שגיאה', error.message || 'לא הצלחנו לשמור את הקטגוריה')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAssignments = async () => {
    try {
      setSavingAssign(true)
      const response = await fetch(`/api/admin/plugin-categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setPlugins', pluginIds: assigned.map((plugin) => plugin.id) })
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'שגיאה בשמירת השיבוץ')
      }

      setAssigned(result.category?.plugins || assigned)
      setAssignDirty(false)
      await onChanged()
      await showAlert('נשמר', 'שיבוץ התוספים בקטגוריה נשמר בהצלחה')
    } catch (error) {
      console.error('Error saving category assignments:', error)
      showAlert('שגיאה', error.message || 'לא הצלחנו לשמור את השיבוץ')
    } finally {
      setSavingAssign(false)
    }
  }

  const handleDelete = async () => {
    const confirmed = await showConfirm(
      'מחיקת קטגוריה',
      `בקטגוריה משובצים ${category.plugins.length} תוספים; הם לא יימחקו אלא רק ישוחררו מהשיבוץ. למחוק?`
    )
    if (!confirmed) return

    try {
      setDeleting(true)
      const response = await fetch(`/api/admin/plugin-categories/${category.id}`, { method: 'DELETE' })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'שגיאה במחיקת הקטגוריה')
      }

      onClose()
      await onChanged()
      await showAlert('קטגוריה נמחקה', `הקטגוריה "${category.name}" נמחקה בהצלחה`)
    } catch (error) {
      console.error('Error deleting category:', error)
      showAlert('שגיאה', error.message || 'לא הצלחנו למחוק את הקטגוריה')
    } finally {
      setDeleting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white p-6">
          <h2 className="text-2xl font-bold text-on-surface">
            {isEdit ? `עריכת קטגוריה: ${category.name}` : 'קטגוריה חדשה'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-neutral-100"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-6 p-6">
          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold text-on-surface/60">שם הקטגוריה</label>
                <input
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
                  placeholder="למשל: כלי לימוד"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-on-surface/60">slug (כתובת דף הקטגוריה)</label>
                <input
                  value={form.slug}
                  onChange={(e) => { setSlugTouched(true); handleChange('slug', e.target.value.toLowerCase()) }}
                  dir="ltr"
                  className={`w-full rounded-xl border px-4 py-3 text-left focus:outline-none focus:ring-4 ${
                    form.slug && !slugValid
                      ? 'border-danger-400 focus:border-danger-500 focus:ring-danger-500/10'
                      : 'border-neutral-200 focus:border-primary focus:ring-primary/10'
                  }`}
                  placeholder="study-tools"
                  required
                />
                {form.slug && !slugValid && (
                  <p className="mt-1 text-xs text-danger-600">
                    slug חייב להכיל אותיות לטיניות קטנות, ספרות ומקפים בלבד (למשל study-tools)
                  </p>
                )}
                {needsManualSlug && (
                  <p className="mt-1 text-xs text-warning-strong-700">
                    לשם עברי חובה להזין slug באנגלית ידנית
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-on-surface/60">תיאור (אופציונלי)</label>
              <textarea
                value={form.description}
                onChange={(e) => handleChange('description', e.target.value)}
                className="min-h-[80px] w-full rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
                placeholder="תיאור קצר שיוצג בראש דף הקטגוריה"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-on-surface/60">
                אייקון (שם Material Symbol, אופציונלי)
              </label>
              <div className="flex items-center gap-3">
                <input
                  value={form.icon}
                  onChange={(e) => handleChange('icon', e.target.value)}
                  dir="ltr"
                  className="flex-1 rounded-xl border border-neutral-200 px-4 py-3 text-left focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
                  placeholder="menu_book"
                />
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 bg-surface" title="תצוגה מקדימה">
                  {form.icon.trim() ? (
                    <span className="material-symbols-outlined text-2xl text-primary">{form.icon.trim()}</span>
                  ) : (
                    <span className="text-xs text-on-surface/30">—</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 transition-colors hover:bg-neutral-50">
                <input
                  type="checkbox"
                  checked={form.showOnHome}
                  onChange={(e) => handleChange('showOnHome', e.target.checked)}
                  className="h-5 w-5 rounded border-neutral-300 text-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="font-medium text-on-surface">הצג בדף הבית</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 transition-colors hover:bg-neutral-50">
                <input
                  type="checkbox"
                  checked={form.isVisible}
                  onChange={(e) => handleChange('isVisible', e.target.checked)}
                  disabled={!isEdit}
                  className="h-5 w-5 rounded border-neutral-300 text-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
                <span className="font-medium text-on-surface">גלויה</span>
                {!isEdit && <span className="text-xs text-on-surface/50">(קטגוריה חדשה נוצרת גלויה)</span>}
              </label>
            </div>

            {form.showOnHome && (
              <div>
                <label className="mb-2 block text-sm font-bold text-on-surface/60">
                  מספר תוספים בשורת דף הבית (3-12)
                </label>
                <input
                  type="number"
                  min={3}
                  max={12}
                  value={form.homeLimit}
                  onChange={(e) => handleChange('homeLimit', e.target.value)}
                  className="w-32 rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
                />
              </div>
            )}

            {/* סדר התצוגה בקטגוריה — ידני מלא או היברידי (מקובעים + דירוג) */}
            <div className="rounded-xl border border-neutral-200 p-4">
              <label className="mb-3 block text-sm font-bold text-on-surface/60">סדר התצוגה בקטגוריה</label>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    value: 'rating',
                    title: 'לפי דירוג המשתמשים',
                    hint: 'תוספים מדורגים גבוה מוצגים ראשונים. אפשר לקבע תוספים בראש הרשימה.'
                  },
                  {
                    value: 'manual',
                    title: 'סדר ידני בלבד',
                    hint: 'בדיוק הסדר שנקבע בשיבוץ למטה; הדירוגים אינם משפיעים.'
                  }
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                      form.sortMode === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-neutral-200 hover:bg-neutral-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sortMode"
                      value={option.value}
                      checked={form.sortMode === option.value}
                      onChange={() => handleChange('sortMode', option.value)}
                      className="mt-1 h-4 w-4 text-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <span>
                      <span className="block font-bold text-on-surface">{option.title}</span>
                      <span className="block text-xs text-on-surface/60">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              {form.sortMode === 'rating' && (
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-bold text-on-surface/60">
                    כמה תוספים מקובעים בראש הרשימה (0-20)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={form.manualTopCount}
                    onChange={(e) => handleChange('manualTopCount', e.target.value)}
                    className="w-32 rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
                  />
                  <p className="mt-1 text-xs text-on-surface/60">
                    {Number(form.manualTopCount) > 0
                      ? `${Number(form.manualTopCount)} התוספים הראשונים בשיבוץ למטה יישארו בסדר הידני, וכל השאר יסודרו לפי דירוג.`
                      : 'כל התוספים בקטגוריה יסודרו לפי דירוג.'}
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSaveDetails}
              disabled={!canSave}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  <span>שומר...</span>
                </>
              ) : (
                <span>{isEdit ? 'שמור פרטים' : 'צור קטגוריה'}</span>
              )}
            </button>
          </section>

          {isEdit && (
            <section className="space-y-4 border-t border-neutral-200 pt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-on-surface">שיבוץ תוספים ({assigned.length})</h3>
                {category.ghostCount > 0 && (
                  <span className="text-sm font-medium text-warning-strong-700">
                    {category.ghostCount} שיבוצי רפאים (תוספים שנמחקו) — יוסרו בשמירת השיבוץ
                  </span>
                )}
              </div>

              <PluginPicker
                options={pickerOptions}
                excludeIds={assigned.map((plugin) => plugin.id)}
                onSelect={(plugin) => {
                  setAssigned((prev) => [...prev, plugin])
                  setAssignDirty(true)
                }}
                placeholder="הוסף תוסף לקטגוריה — חיפוש לפי שם..."
              />

              {assigned.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-on-surface/50">
                  אין תוספים משובצים בקטגוריה זו
                </p>
              ) : (
                <div className="space-y-2">
                  {assigned.map((plugin, index) => (
                    <div key={plugin.id}>
                      <div {...assignedDnd(index)}>
                        <OrderedPluginRow
                          plugin={plugin}
                          index={index}
                          total={assigned.length}
                          onMove={(i, dir) => {
                            setAssigned((prev) => moveItem(prev, i, dir))
                            setAssignDirty(true)
                          }}
                          onRemove={(i) => {
                            setAssigned((prev) => prev.filter((_, idx) => idx !== i))
                            setAssignDirty(true)
                          }}
                        />
                      </div>
                      {/* קו הפרדה בין החלק המקובע ידנית לחלק שמסודר לפי דירוג */}
                      {form.sortMode === 'rating'
                        && Number(form.manualTopCount) > 0
                        && index === Number(form.manualTopCount) - 1
                        && index < assigned.length - 1 && (
                        <div className="flex items-center gap-2 py-2 text-xs font-bold text-on-surface/50">
                          <span className="h-px flex-1 bg-neutral-200" />
                          <span className="material-symbols-outlined text-sm leading-none text-warning-500">star</span>
                          <span>מכאן ומטה: הסדר נקבע לפי דירוג המשתמשים</span>
                          <span className="h-px flex-1 bg-neutral-200" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveAssignments}
                disabled={!assignDirty || savingAssign}
                className="flex items-center justify-center gap-2 rounded-xl bg-success-600 px-6 py-3 font-bold text-white transition-colors hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingAssign ? (
                  <>
                    <span className="material-symbols-outlined animate-spin">progress_activity</span>
                    <span>שומר...</span>
                  </>
                ) : (
                  <span>שמור שיבוץ</span>
                )}
              </button>
            </section>
          )}

          <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 rounded-xl bg-danger-100 px-4 py-2.5 font-bold text-danger-700 transition-colors hover:bg-danger-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="material-symbols-outlined">{deleting ? 'progress_activity' : 'delete'}</span>
                <span>מחק קטגוריה</span>
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-200 px-6 py-2.5 font-bold text-on-surface transition-colors hover:bg-neutral-50"
            >
              סגור
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
