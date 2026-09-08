'use client'

// לשונית "סידור החנות" בעמוד ניהול התוספים — אצירת דף הבית של חנות התוספים:
// תוספים נבחרים (סדר + כותרות), קטגוריות (יצירה/עריכה/סדר/שיבוצים) ותוספים לא משוכנים.

import { useEffect, useState } from 'react'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { moveItem, reorderList } from './listReorder'
import { useDragReorder, StatusBadge, MiniImage, PluginPicker, OrderedPluginRow } from './StoreLayoutShared'
import CategoryModal from './CategoryModal'

const DEFAULT_HOME_TITLE = 'חנות התוספים של אוצריא'
const DEFAULT_HOME_SUBTITLE = 'הרחיבו את אוצריא עם תוספים מהקהילה'
const FEATURED_SOFT_LIMIT = 8

// נרמול תוסף מרשימת הניהול (GET /api/admin/plugins) לצורת התצוגה של הלשונית
function normalizeAdminPlugin(plugin) {
  return {
    id: plugin._id,
    name: plugin.name,
    version: plugin.version,
    status: plugin.status,
    isApproved: plugin.isApproved !== false,
    isHidden: plugin.isHidden === true,
    isSuspended: plugin.isSuspended === true,
    downloadCount: plugin.downloadCount || 0,
    image: plugin.image?.ext ? `/api/plugins/${plugin._id}/image` : null
  }
}

export default function StoreLayoutTab() {
  const { showAlert } = useDialog()
  const [section, setSection] = useState('featured') // 'featured' | 'categories' | 'unplaced'
  const [loading, setLoading] = useState(true)

  // רשימת כל התוספים המאושרים — לשדות ההוספה (autocomplete)
  const [pickerOptions, setPickerOptions] = useState([])

  // נבחרים + כותרות דף הבית (עותק עבודה + snapshot לזיהוי שינויים לא שמורים)
  const [featured, setFeatured] = useState([])
  const [homeTitle, setHomeTitle] = useState('')
  const [homeSubtitle, setHomeSubtitle] = useState('')
  const [savedSettings, setSavedSettings] = useState({ ids: [], homeTitle: '', homeSubtitle: '' })
  const [savingSettings, setSavingSettings] = useState(false)

  // קטגוריות
  const [categories, setCategories] = useState([])
  const [reorderingId, setReorderingId] = useState(null)
  const [categoryModal, setCategoryModal] = useState(null) // { mode: 'create' } | { mode: 'edit', categoryId }

  // לא משוכנים
  const [unplaced, setUnplaced] = useState([])
  const [unplacedActionId, setUnplacedActionId] = useState(null)

  // גרירה-ושחרור של רשימת הנבחרים (נשמר רק בלחיצה על "שמור", כמו החיצים)
  const featuredDnd = useDragReorder((from, to) => setFeatured((prev) => reorderList(prev, from, to)))

  const applySettings = (settings) => {
    setFeatured(settings.featuredPlugins || [])
    setHomeTitle(settings.homeTitle || '')
    setHomeSubtitle(settings.homeSubtitle || '')
    setSavedSettings({
      ids: (settings.featuredPlugins || []).map((plugin) => plugin.id),
      homeTitle: settings.homeTitle || '',
      homeSubtitle: settings.homeSubtitle || ''
    })
  }

  const settingsDirty =
    homeTitle !== savedSettings.homeTitle ||
    homeSubtitle !== savedSettings.homeSubtitle ||
    featured.map((plugin) => plugin.id).join(',') !== savedSettings.ids.join(',')

  const fetchJson = async (url) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to fetch ${url}`)
    return response.json()
  }

  const loadCategories = async () => {
    setCategories(await fetchJson('/api/admin/plugin-categories'))
  }

  const loadUnplaced = async () => {
    const data = await fetchJson('/api/admin/plugin-store/unplaced')
    setUnplaced(data.plugins || [])
  }

  const loadAll = async () => {
    try {
      setLoading(true)
      const [settings, categoriesData, unplacedData, approvedData] = await Promise.all([
        fetchJson('/api/admin/store-settings'),
        fetchJson('/api/admin/plugin-categories'),
        fetchJson('/api/admin/plugin-store/unplaced'),
        fetchJson('/api/admin/plugins?status=approved')
      ])
      applySettings(settings)
      setCategories(categoriesData)
      setUnplaced(unplacedData.plugins || [])
      setPickerOptions(approvedData.map(normalizeAdminPlugin))
    } catch (error) {
      console.error('Error loading store layout data:', error)
      showAlert('שגיאה בטעינה', 'לא הצלחנו לטעון את נתוני סידור החנות')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  // טעינה חד-פעמית בפתיחת הלשונית
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- נבחרים ---

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true)
      const response = await fetch('/api/admin/store-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featuredPluginIds: featured.map((plugin) => plugin.id),
          homeTitle: homeTitle.trim(),
          homeSubtitle: homeSubtitle.trim()
        })
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'שגיאה בשמירת ההגדרות')
      }

      applySettings(result.settings)
      await loadUnplaced()
      await showAlert('נשמר', 'הגדרות דף הבית נשמרו בהצלחה')
    } catch (error) {
      console.error('Error saving store settings:', error)
      showAlert('שגיאה', error.message || 'לא הצלחנו לשמור את הגדרות דף הבית')
    } finally {
      setSavingSettings(false)
    }
  }

  // --- קטגוריות ---

  // העברת קטגוריה למיקום יעד (השרת משבץ מחדש 0..N-1) — משמש גם את החיצים וגם את הגרירה
  const reorderCategoryTo = async (category, target) => {
    try {
      setReorderingId(category.id)
      const response = await fetch(`/api/admin/plugin-categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder', order: target })
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'שגיאה בשינוי הסדר')
      }

      await loadCategories()
    } catch (error) {
      console.error('Error reordering category:', error)
      showAlert('שגיאה', error.message || 'לא הצלחנו לשנות את סדר הקטגוריות')
    } finally {
      setReorderingId(null)
    }
  }

  const handleCategoryReorder = (category, direction) => {
    const index = categories.findIndex((item) => item.id === category.id)
    const target = index + direction
    if (target < 0 || target >= categories.length) return
    reorderCategoryTo(category, target)
  }

  const categoriesDnd = useDragReorder((from, to) => {
    if (reorderingId !== null) return
    reorderCategoryTo(categories[from], to)
  })

  // --- לא משוכנים ---

  const handleAssignUnplaced = async (plugin, categoryId) => {
    if (!categoryId) return
    const category = categories.find((item) => item.id === categoryId)

    try {
      setUnplacedActionId(plugin.id)
      const response = await fetch(`/api/admin/plugin-categories/${categoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addPlugin', pluginId: plugin.id })
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'שגיאה בשיבוץ התוסף')
      }

      setUnplaced((prev) => prev.filter((item) => item.id !== plugin.id))
      await loadCategories()
      await showAlert('שובץ בהצלחה', `התוסף "${plugin.name}" שובץ לקטגוריה "${category?.name || ''}"`)
    } catch (error) {
      console.error('Error assigning unplaced plugin:', error)
      showAlert('שגיאה', error.message || 'לא הצלחנו לשבץ את התוסף')
    } finally {
      setUnplacedActionId(null)
    }
  }

  const handleAddUnplacedToFeatured = async (plugin) => {
    if (settingsDirty) {
      showAlert(
        'שינויים לא שמורים',
        'יש שינויים שלא נשמרו במקטע "תוספים נבחרים" — יש לשמור אותם לפני הוספת תוסף מכאן'
      )
      return
    }

    try {
      setUnplacedActionId(plugin.id)
      // הוספה אטומית ($addToSet בשרת) — לא דורסת שינויים מקבילים של מנהל אחר
      const response = await fetch('/api/admin/store-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addFeatured', pluginId: plugin.id })
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'שגיאה בהוספה לנבחרים')
      }

      applySettings(result.settings)
      // התוסף נשאר ברשימת הלא-משוכנים (נבחרוּת אינה שיבוץ לקטגוריה) — רק מתעדכן הדגל
      await loadUnplaced()
      await showAlert('נוסף לנבחרים', `התוסף "${plugin.name}" נוסף לנבחרים בדף הבית`)
    } catch (error) {
      console.error('Error adding unplaced plugin to featured:', error)
      showAlert('שגיאה', error.message || 'לא הצלחנו להוסיף את התוסף לנבחרים')
    } finally {
      setUnplacedActionId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <LoadingSpinner />
      </div>
    )
  }

  const editedCategory = categoryModal?.mode === 'edit'
    ? categories.find((category) => category.id === categoryModal.categoryId)
    : null

  const sections = [
    { key: 'featured', label: 'תוספים נבחרים', icon: 'star' },
    { key: 'categories', label: 'קטגוריות', icon: 'category' },
    { key: 'unplaced', label: `לא משוכנים${unplaced.length > 0 ? ` (${unplaced.length})` : ''}`, icon: 'inbox' }
  ]

  return (
    <div className="space-y-6">
      {/* הסבר כללי על מנגנון האצירה — חשוב למנהל שאינו מכיר את המבנה */}
      <div className="flex items-start gap-3 rounded-2xl border border-info-200 bg-info-50 px-5 py-4 text-sm leading-relaxed text-info-900">
        <span className="material-symbols-outlined mt-0.5 text-info-700">info</span>
        <p>
          דף הבית של החנות מציג <strong>רק</strong> את מה שנבחר כאן ידנית — תוספים נבחרים ושורות קטגוריה.
          השיבוץ לקטגוריות הוא <strong>אופציונלי לגמרי</strong>: תוסף מאושר שלא שובץ לשום קטגוריה איננו נעלם —
          הוא זמין תמיד בחיפוש, בקישור ישיר ובדף &quot;כל התוספים&quot;.
          תוסף יכול להשתייך לכמה קטגוריות בו-זמנית, והכול ניתן לשינוי בכל רגע.
        </p>
      </div>

      {/* מקטעים פנימיים */}
      <div className="flex flex-wrap gap-2">
        {sections.map((item) => (
          <button
            key={item.key}
            onClick={() => setSection(item.key)}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 font-bold transition-colors ${
              section === item.key
                ? 'bg-primary text-white'
                : 'bg-surface text-on-surface/70 hover:bg-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-base">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* --- תוספים נבחרים --- */}
      {section === 'featured' && (
        <div className="glass rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-on-surface">תוספים נבחרים בדף הבית</h2>
            <p className="mt-1 text-sm text-on-surface/60">
              התוספים יוצגו בדף הבית של החנות לפי הסדר כאן. השינויים נשמרים רק בלחיצה על &quot;שמור&quot;.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-on-surface/60">כותרת דף הבית</label>
              <input
                value={homeTitle}
                onChange={(e) => setHomeTitle(e.target.value)}
                placeholder={DEFAULT_HOME_TITLE}
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-bold text-on-surface/60">תת-כותרת דף הבית</label>
              <input
                value={homeSubtitle}
                onChange={(e) => setHomeSubtitle(e.target.value)}
                placeholder={DEFAULT_HOME_SUBTITLE}
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
              />
            </div>
          </div>
          <p className="text-xs text-on-surface/50">
            השארת שדה ריק תציג את ברירת המחדל של האתר (מופיעה כ-placeholder).
          </p>

          <PluginPicker
            options={pickerOptions}
            excludeIds={featured.map((plugin) => plugin.id)}
            onSelect={(plugin) => setFeatured((prev) => [...prev, plugin])}
            placeholder="הוסף תוסף לנבחרים — חיפוש לפי שם..."
          />

          {featured.length > FEATURED_SOFT_LIMIT && (
            <p className="flex items-center gap-2 text-sm font-medium text-warning-strong-700">
              <span className="material-symbols-outlined text-base">warning</span>
              <span>מומלץ עד {FEATURED_SOFT_LIMIT} תוספים נבחרים — כרגע {featured.length}</span>
            </p>
          )}

          {featured.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-on-surface/50">
              אין תוספים נבחרים — מקטע הנבחרים לא יוצג בדף הבית
            </p>
          ) : (
            <div className="space-y-2">
              {featured.map((plugin, index) => (
                <div key={plugin.id} {...featuredDnd(index)}>
                  <OrderedPluginRow
                    plugin={plugin}
                    index={index}
                    total={featured.length}
                    onMove={(i, dir) => setFeatured((prev) => moveItem(prev, i, dir))}
                    onRemove={(i) => setFeatured((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={!settingsDirty || savingSettings}
              className="flex items-center gap-2 rounded-xl bg-primary px-8 py-3 font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingSettings ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  <span>שומר...</span>
                </>
              ) : (
                <span>שמור</span>
              )}
            </button>
            {settingsDirty && !savingSettings && (
              <span className="text-sm text-warning-strong-700">יש שינויים שלא נשמרו</span>
            )}
          </div>
        </div>
      )}

      {/* --- קטגוריות --- */}
      {section === 'categories' && (
        <div className="glass rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-on-surface">קטגוריות החנות</h2>
              <p className="mt-1 text-sm text-on-surface/60">
                שינוי הסדר נשמר מיידית. לחיצה על קטגוריה פותחת עריכה מלאה כולל שיבוץ תוספים.
                תוסף יכול להופיע בכמה קטגוריות — ואין חובה לשבץ כל תוסף: מה שלא שובץ נגיש בחיפוש ובדף &quot;כל התוספים&quot;.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCategoryModal({ mode: 'create' })}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-bold text-white transition-colors hover:bg-primary/90"
            >
              <span className="material-symbols-outlined">add</span>
              <span>קטגוריה חדשה</span>
            </button>
          </div>

          {categories.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-on-surface/50">
              עדיין לא נוצרו קטגוריות
            </p>
          ) : (
            <div className="space-y-2">
              {categories.map((category, index) => {
                const visibleCount = category.plugins.filter(
                  (plugin) => plugin.isApproved && !plugin.isHidden && !plugin.isSuspended
                ).length
                const dndProps = categoriesDnd(index)
                return (
                  <div
                    key={category.id}
                    {...dndProps}
                    className={`flex items-center gap-3 border border-neutral-200 p-3 transition-colors ${
                      category.isVisible ? 'bg-surface' : 'bg-neutral-100 opacity-60'
                    } ${dndProps.className}`}
                  >
                    <span className="material-symbols-outlined text-on-surface/25" title="גרור לשינוי סדר">drag_indicator</span>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => handleCategoryReorder(category, -1)}
                        disabled={index === 0 || reorderingId !== null}
                        className="rounded p-0.5 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
                        title="הזז למעלה"
                      >
                        <span className="material-symbols-outlined text-base">arrow_upward</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCategoryReorder(category, 1)}
                        disabled={index === categories.length - 1 || reorderingId !== null}
                        className="rounded p-0.5 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
                        title="הזז למטה"
                      >
                        <span className="material-symbols-outlined text-base">arrow_downward</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCategoryModal({ mode: 'edit', categoryId: category.id })}
                      className="flex min-w-0 flex-1 items-center gap-3 text-right"
                    >
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <span className="material-symbols-outlined text-primary">
                          {reorderingId === category.id ? 'progress_activity' : (category.icon || 'category')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-on-surface">{category.name}</span>
                          <span className="text-xs text-on-surface/40" dir="ltr">/{category.slug}</span>
                          {!category.isVisible && (
                            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-bold text-on-surface/60">מוסתרת</span>
                          )}
                          {category.showOnHome && (
                            <span className="rounded-full bg-info-100 px-2 py-0.5 text-xs font-bold text-info-800">בדף הבית ({category.homeLimit})</span>
                          )}
                          {category.sortMode === 'rating' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-bold text-warning-strong-800">
                              <span className="material-symbols-outlined text-sm leading-none">star</span>
                              <span>לפי דירוג{category.manualTopCount > 0 ? ` (${category.manualTopCount} מקובעים)` : ''}</span>
                            </span>
                          ) : (
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-on-surface/60">סדר ידני</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface/60">
                          <span>משובצים {category.plugins.length} / יוצגו {visibleCount}</span>
                          {category.ghostCount > 0 && (
                            <span className="font-bold text-warning-strong-700">
                              {category.ghostCount} שיבוצי רפאים (תוספים שנמחקו)
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-on-surface/30">edit</span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* --- לא משוכנים --- */}
      {section === 'unplaced' && (
        <div className="glass rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-on-surface">תוספים לא משוכנים</h2>
            <p className="mt-1 text-sm text-on-surface/60">
              תוספים מאושרים שאינם משובצים בשום קטגוריה (גם אם הם ברשימת הנבחרים — נבחרוּת אינה שיבוץ).
              זה מצב תקין — הם עדיין זמינים בחיפוש, בקישור ישיר ובדף &quot;כל התוספים&quot;; הרשימה כאן היא רק כלי עזר לאצירה.
            </p>
          </div>

          {unplaced.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-on-surface/50">
              כל התוספים המאושרים משוכנים — אין backlog לטיפול
            </p>
          ) : (
            <div className="space-y-2">
              {unplaced.map((plugin) => (
                <div key={plugin.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-surface p-3">
                  <MiniImage src={plugin.image} alt={plugin.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold text-on-surface">{plugin.name}</span>
                      <span className="text-xs text-on-surface/50">גרסה {plugin.version}</span>
                      <StatusBadge status={plugin.status} />
                      {plugin.isFeatured && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning-100 px-2.5 py-0.5 text-xs font-bold text-warning-800">
                          <span className="material-symbols-outlined text-sm">star</span>
                          <span>נבחר</span>
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface/60">
                      <span>{plugin.downloadCount || 0} הורדות</span>
                      {plugin.tags?.length > 0 && (
                        <span className="truncate">תגיות: {plugin.tags.join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value=""
                      onChange={(e) => handleAssignUnplaced(plugin, e.target.value)}
                      disabled={unplacedActionId === plugin.id || categories.length === 0}
                      className="rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="" disabled>
                        {categories.length === 0 ? 'אין קטגוריות' : 'שבץ ל...'}
                      </option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}{category.isVisible ? '' : ' (מוסתרת)'}
                        </option>
                      ))}
                    </select>
                    {!plugin.isFeatured && (
                      <button
                        type="button"
                        onClick={() => handleAddUnplacedToFeatured(plugin)}
                        disabled={unplacedActionId === plugin.id}
                        className="flex items-center gap-1 rounded-xl bg-warning-100 px-3 py-2 text-sm font-bold text-warning-800 transition-colors hover:bg-warning-200 disabled:cursor-not-allowed disabled:opacity-50"
                        title="הוסף לרשימת הנבחרים בדף הבית"
                      >
                        <span className="material-symbols-outlined text-base">
                          {unplacedActionId === plugin.id ? 'progress_activity' : 'star'}
                        </span>
                        <span>הוסף לנבחרים</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* מודאל קטגוריה (יצירה/עריכה) */}
      {categoryModal?.mode === 'create' && (
        <CategoryModal
          category={null}
          pickerOptions={pickerOptions}
          onClose={() => setCategoryModal(null)}
          onChanged={async () => {
            await Promise.all([loadCategories(), loadUnplaced()])
          }}
        />
      )}
      {categoryModal?.mode === 'edit' && editedCategory && (
        <CategoryModal
          category={editedCategory}
          pickerOptions={pickerOptions}
          onClose={() => setCategoryModal(null)}
          onChanged={async () => {
            await Promise.all([loadCategories(), loadUnplaced()])
          }}
        />
      )}
    </div>
  )
}
