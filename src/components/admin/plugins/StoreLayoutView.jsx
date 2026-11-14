'use client'

import { useEffect, useMemo, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import LoadError from '@/components/admin/list/LoadError'
import { toLayoutPlugin } from '@/lib/adminPlugins/storeLayout'
import CategoryDrawer from './CategoryDrawer'
import { StoreLayoutSkeleton } from './PluginsSkeleton'
import { CategoriesSection, FeaturedSection, HomeTextSection, UnplacedSection } from './StoreLayoutSections'
import { useStoreLayout } from './useStoreLayout'

/**
 * "סידור החנות" — מה מוצג בדף הבית של החנות, באזורים:
 *   כותרות ונבחרים — נשמרים רק ב"שמור שינויים", שמופיע דביק בתחתית כשיש שינוי.
 *   קטגוריות — סדר (נשמר מיד, כמו קודם), ועריכה במגירה (CategoryDrawer).
 *   לא משובצים — תוספים שאינם באף קטגוריה: "שבץ" או "הוסף לנבחרים".
 * שינוי שלא נשמר (כאן או במגירת הקטגוריה) עולה למסך ב-onDirtyChange: "לצאת בלי לשמור?" בכל קישור וב"אחורה".
 * הבקשות — ב-useStoreLayout; האזורים — ב-StoreLayoutSections.
 *
 * @param {{ toast: any, confirm: Function, approved: any[] | null, approvedFailed?: boolean, onRetryApproved?: () => void,
 *   onDirtyChange: (dirty: boolean) => void, onCategoriesChanged?: () => void }} props
 */
export default function StoreLayoutView({ toast, confirm, approved, approvedFailed = false, onRetryApproved, onDirtyChange, onCategoriesChanged }) {
  const layout = useStoreLayout({ toast, onCategoriesChanged })
  const [drawer, setDrawer] = useState(null) // { id } | { create: true }
  const [categoryDirty, setCategoryDirty] = useState(false)
  const options = useMemo(() => (approved || []).map(toLayoutPlugin), [approved])
  const { load, dirty } = layout

  const anyDirty = dirty || categoryDirty
  useEffect(() => { onDirtyChange?.(anyDirty) }, [anyDirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  if (load.status === 'loading') {
    return (
      <div aria-busy="true">
        <p role="status" className="sr-only">טוען את סידור החנות…</p>
        <StoreLayoutSkeleton />
      </div>
    )
  }
  if (load.status === 'error') {
    return <LoadError error={load.error} title="לא הצלחנו לטעון את סידור החנות" sessionText="התחבר מחדש כדי לסדר את החנות. אחרי ההתחברות תחזור לכאן." onRetry={layout.loadAll} />
  }

  const editing = drawer?.id ? layout.categories.find((c) => c.id === drawer.id) : null

  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-start gap-2 rounded-(--radius-control) bg-info-container px-4 py-3 text-body-sm text-on-info-container">
        <AppIcon name="info" className="mt-0.5 shrink-0 text-icon-md" />
        <span>דף הבית של החנות מציג רק את מה שנבחר כאן. אין חובה לשבץ כל תוסף: תוסף שלא שובץ זמין בחיפוש, בקישור ישיר ובדף &quot;כל התוספים&quot;.</span>
      </p>

      <HomeTextSection title={layout.homeTitle} subtitle={layout.homeSubtitle} onTitle={layout.setHomeTitle} onSubtitle={layout.setHomeSubtitle} />
      <FeaturedSection
        items={layout.featured}
        onChange={layout.setFeatured}
        options={options}
        disabled={layout.saving}
        optionsReady={approved !== null}
        optionsFailed={approvedFailed}
        onRetryOptions={onRetryApproved}
      />
      <CategoriesSection
        categories={layout.categories}
        reordering={layout.reordering}
        onMove={layout.moveCategory}
        onEdit={(category) => setDrawer({ id: category.id })}
        onCreate={() => setDrawer({ create: true })}
      />
      <UnplacedSection
        plugins={layout.unplaced}
        categories={layout.categories}
        dirty={dirty}
        working={layout.working}
        onFeature={layout.feature}
        onAssign={layout.assign}
      />

      {dirty && (
        <div className="sticky bottom-0 z-(--z-raised) -mt-2 flex items-center justify-end gap-2 border-t border-outline-variant bg-background py-3 sm:gap-3">
          <p role="status" className="me-auto min-w-0 text-body-sm text-on-surface-variant">
            <span className="sm:hidden">לא נשמר</span>
            <span className="max-sm:sr-only">יש שינויים שלא נשמרו.</span>
          </p>
          <Button variant="text" size="sm" onClick={layout.discard} disabled={layout.saving}>בטל שינויים</Button>
          <Button variant="filled" size="sm" icon="save" onClick={layout.save} loading={layout.saving}>{layout.saving ? 'שומר…' : 'שמור שינויים'}</Button>
        </div>
      )}

      {drawer && (drawer.create || editing) && (
        <CategoryDrawer
          key={drawer.id || 'new'}
          category={editing}
          options={options}
          toast={toast}
          confirm={confirm}
          onClose={() => setDrawer(null)}
          onChanged={layout.refreshSide}
          onDirtyChange={setCategoryDirty}
        />
      )}
    </div>
  )
}
