'use client'

import { useCallback, useEffect, useState } from 'react'
import { errorToast } from '@/components/admin/list/adminRequest'
import { settingsDirty, settingsSnapshot } from '@/lib/adminPlugins/storeLayout'
import * as api from './pluginsApi'

const SYNC_FAILED = 'השינוי נשמר, אבל לא הצלחנו לרענן את הרשימה. רענן את העמוד.'

/**
 * הנתונים והבקשות של "סידור החנות": הגדרות דף הבית (נשמרות בכפתור), הקטגוריות (הסדר נשמר מיד) והתוספים
 * שלא שובצו. רענון שנכשל אחרי כתיבה מוצלחת לא מדווח ככשל של השמירה: הרענון תמיד מחוץ ל-try של הכתיבה.
 * onCategoriesChanged — "בחנות" ו"לאישור" מחזיקים עותק משלהם של הקטגוריות (סינון, שיבוץ), והוא מתעדכן כאן.
 *
 * @param {{ toast: any, onCategoriesChanged?: () => void }} options
 */
export function useStoreLayout({ toast, onCategoriesChanged }) {
  const [load, setLoad] = useState({ status: 'loading', error: null })
  const [featured, setFeatured] = useState([])
  const [homeTitle, setHomeTitle] = useState('')
  const [homeSubtitle, setHomeSubtitle] = useState('')
  const [saved, setSaved] = useState(() => settingsSnapshot(null))
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState([])
  const [reordering, setReordering] = useState(null)
  const [unplaced, setUnplaced] = useState([])
  const [working, setWorking] = useState(null)

  const apply = useCallback((settings) => {
    const snapshot = settingsSnapshot(settings)
    setFeatured(snapshot.plugins)
    setHomeTitle(snapshot.homeTitle)
    setHomeSubtitle(snapshot.homeSubtitle)
    setSaved(snapshot)
  }, [])

  const loadAll = useCallback(async () => {
    setLoad({ status: 'loading', error: null })
    try {
      const [settings, cats, un] = await Promise.all([api.loadStoreSettings(), api.listCategories(), api.loadUnplaced()])
      apply(settings)
      setCategories(Array.isArray(cats) ? cats : [])
      setUnplaced(un?.plugins || [])
      setLoad({ status: 'ready', error: null })
    } catch (error) {
      setLoad({ status: 'error', error })
    }
  }, [apply])

  useEffect(() => {
    // טעינה בכניסה לתצוגה; ה-setState אחרי await
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [loadAll])

  /** מרענן קטגוריות ולא-משובצים אחרי שינוי בקטגוריה. זורק אם נכשל — המגירה מחליטה מה לומר */
  const refreshSide = useCallback(async () => {
    const [cats, un] = await Promise.all([api.listCategories(), api.loadUnplaced()])
    setCategories(Array.isArray(cats) ? cats : [])
    setUnplaced(un?.plugins || [])
    onCategoriesChanged?.()
  }, [onCategoriesChanged])

  const dirty = load.status === 'ready' && settingsDirty(saved, { featured, homeTitle, homeSubtitle })

  const save = async () => {
    setSaving(true)
    try {
      const result = await api.saveStoreSettings({
        featuredPluginIds: featured.map((p) => p.id),
        homeTitle: homeTitle.trim(),
        homeSubtitle: homeSubtitle.trim(),
      })
      apply(result.settings)
      toast.show({ tone: 'success', message: 'השינויים נשמרו — כך ייראה דף הבית של החנות' })
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו לשמור את השינויים.'))
      return
    } finally {
      setSaving(false)
    }
    refreshSide().catch(() => {})
  }

  const discard = () => {
    setFeatured(saved.plugins)
    setHomeTitle(saved.homeTitle)
    setHomeSubtitle(saved.homeSubtitle)
  }

  /** סדר הקטגוריות נשמר מיד (השרת מסדר מחדש 0..N-1). true — הזזה שהצליחה */
  const moveCategory = async (category, target) => {
    if (target < 0 || target >= categories.length) return false
    setReordering(category.id)
    try {
      await api.reorderCategory(category.id, target)
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו לשנות את הסדר.'))
      setReordering(null)
      return false
    }
    try {
      setCategories(await api.listCategories())
      onCategoriesChanged?.()
    } catch {
      toast.show({ tone: 'info', message: SYNC_FAILED })
    }
    setReordering(null)
    return true
  }

  const assign = async (plugin, categoryId) => {
    const category = categories.find((c) => c.id === categoryId)
    setWorking(plugin.id)
    try {
      await api.toggleCategoryPlugin(categoryId, plugin.id, true)
      setUnplaced((list) => list.filter((p) => p.id !== plugin.id))
      toast.show({ message: `״${plugin.name}״ שובץ ב״${category?.name || ''}״` })
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו לשבץ את התוסף.'))
      setWorking(null)
      return
    }
    await refreshSide().catch(() => toast.show({ tone: 'info', message: SYNC_FAILED }))
    setWorking(null)
  }

  const feature = async (plugin) => {
    setWorking(plugin.id)
    try {
      const result = await api.addFeatured(plugin.id)
      apply(result.settings)
      toast.show({ message: `״${plugin.name}״ נוסף לנבחרים` })
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו להוסיף לנבחרים.'))
      setWorking(null)
      return
    }
    try {
      setUnplaced((await api.loadUnplaced())?.plugins || [])
    } catch {
      toast.show({ tone: 'info', message: SYNC_FAILED })
    }
    setWorking(null)
  }

  return {
    load, loadAll, featured, setFeatured, homeTitle, setHomeTitle, homeSubtitle, setHomeSubtitle, saving, dirty, save, discard,
    categories, reordering, moveCategory, unplaced, working, assign, feature, refreshSide,
  }
}
